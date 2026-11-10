//! A check decision written as the Rust translationCore 4 writes it (its `docs/STORAGE.md`
//! §5.4), through its own `tc-store`, at `POST /api/tc/decide/<repo path>`.
//!
//! The phone's projects are Pankosmia repositories under `<home>/pankosmia_repos/`. A project of
//! the Rust tC4's format (one with `ingredients/tc/project.json`) is opened, the decision is saved
//! as one `Check` change, and the project is closed again, which seals the change into a pack
//! under `ingredients/tc/changes/`, rewrites `ingredients/checking/<tool>/<BOOK>.json` from the
//! fold, and commits. The client reads that file back, so what it shows is the fold's projection.
//!
//! `POST /api/tc/sync/<repo path>` syncs such a project with Door43 as the Rust tC4 does
//! (STORAGE.md §9, `tc_sync::sync`): it seals, fetches, takes in the teammates' packs, commits
//! the merge and pushes. Pankosmia's pull never runs on such a project: it would merge the two
//! histories with git and leave conflict markers in the derived files.
//!
//! Nothing stays open between two requests, and one request runs at a time: a second open of a
//! folder that is still open would be refused (`.tc/lock`). The shell and the journeys' rig both
//! mount this file (`dev-env/rig/src/main.rs`), so the journeys run this code.

use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::serde::Deserialize;
use rocket::{Build, Rocket, State};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tc_door43::{Door43Client, InternetSwitch, RepoRef, ServerUrl, Session, Token};
use tc_journal::command::{Command, DecisionBasis, DecisionChange, DecisionEdit};
use tc_journal::keys::{CheckId, CheckKey, CheckTarget, RefPart, ToolId};
use tc_journal::record::{ResourceRef, Selection, UserStatus};
use tc_journal::{BookId, ChapterNo, GitOid, JsonMap, RecordKey, VerseNo};
use tc_store::{
    Mode, OpenError, OpenOptions, ProjectHandle, StdFs, StdPlatform, Store, StoreConfig,
    SystemClock,
};
use tc_sync::machine::{Ended, Received};

/// The projects of this installation and where Pankosmia keeps their folders.
pub struct Projects {
    store: Store,
    repos: PathBuf,
    /// The Door43 every project syncs with instead of `https://<host>`: the journeys' fake.
    /// `None` on a phone.
    door43: Option<ServerUrl>,
    /// One request at a time: a second open of a folder that is still open would be refused
    /// (`.tc/lock`), and a checker can tap Next and decide again, or tap Sync, before the first
    /// save is done.
    one_at_a_time: Mutex<()>,
}

impl Projects {
    /// Starts the store with its application data in `app_data` (the installation secret and
    /// the device ledger, STORAGE.md §3.7), for the Pankosmia repositories under `repos`.
    /// `door43` replaces every project's Door43 server, for the journeys; the shell gives none.
    ///
    /// # Errors
    ///
    /// When `app_data` cannot be created or read.
    pub fn start(
        app_data: &Path,
        repos: PathBuf,
        door43: Option<ServerUrl>,
    ) -> Result<Self, tc_store::StoreError> {
        let store = Store::start(StoreConfig {
            app_data: app_data.to_owned(),
            // The phone creates no project of its own; Pankosmia clones them.
            projects: app_data.join("projects"),
            vfs: Arc::new(StdFs),
            platform: Arc::new(StdPlatform),
            clock: Arc::new(SystemClock),
            threads: 2,
            // The app's own value (STORAGE.md §11.1).
            watch_debounce: Duration::from_secs(1),
        })?;
        Ok(Self {
            store,
            repos,
            door43,
            one_at_a_time: Mutex::new(()),
        })
    }

    /// Records one decision on the check `body` names, in the project at `repo` (a Pankosmia
    /// repo path such as `git.door43.org/<org>/<repo>`), and closes the project again.
    ///
    /// # Errors
    ///
    /// [`DecideError::NotTc`] for a folder that is not of the Rust tC4's format (a tC4 4.x or
    /// an older project), [`DecideError::BadRequest`] for a body that names no check, and the
    /// store's own refusal otherwise, in its words.
    pub fn decide(&self, repo: &Path, body: &Decide) -> Result<(), DecideError> {
        let edit = body.edit()?;
        let (key, verse) = body.keys()?;
        let _one = self
            .one_at_a_time
            .lock()
            .expect("the decision lock is poisoned");
        let handle = self.open(repo)?;
        // The screen showed the fold as it is now: the list was read from this fold's projection,
        // and nothing else writes the project while a decision is made (one at a time, above).
        let saved = (|| {
            let shown = handle
                .mint(&RecordKey::Check(key), None)
                .map_err(|e| DecideError::Store(e.to_string()))?;
            let verse_shown = handle
                .mint(&verse, None)
                .map_err(|e| DecideError::Store(e.to_string()))?;
            handle
                .submit(Command::SaveDecision {
                    shown,
                    verse_shown,
                    value: edit,
                })
                .wait()
                .map_err(|e| DecideError::Store(e.to_string()))
        })();
        // Closing checkpoints: the change is sealed into a pack, the decision file is written
        // again from the fold, and the folder is committed (STORAGE.md §5.13).
        let closed = handle
            .close()
            .map_err(|e| DecideError::Store(e.to_string()));
        saved?;
        closed
    }

    /// Syncs the project at `repo` (`<host>/<owner>/<name>`) with its Door43 repository, as
    /// `session`, and closes it again. A Pankosmia clone is connected first (`origin` and
    /// `tc.branch`, STORAGE.md §9.6), on the branch it was cloned at. `runtime` runs the sync's
    /// network calls; this call blocks until the sync ends.
    ///
    /// # Errors
    ///
    /// [`DecideError::NotTc`] for a folder that is not of the Rust tC4's format, and the store's
    /// own refusal when the project cannot be opened or connected. A sync that runs and fails
    /// is not an error: [`Synced::Failed`] says why, in tC4's own terms.
    pub fn sync(
        &self,
        runtime: &rocket::tokio::runtime::Handle,
        repo: &Path,
        session: Session,
    ) -> Result<Synced, DecideError> {
        let (host, door43_repo) = door43_of(repo)?;
        let server = match &self.door43 {
            Some(server) => server.clone(),
            None => format!("https://{host}")
                .parse()
                .map_err(|_| bad(format!("{host} is not a Door43 server")))?,
        };
        let _one = self
            .one_at_a_time
            .lock()
            .expect("the decision lock is poisoned");
        let handle = self.open(repo)?;
        let synced = (|| {
            if branch_of(&handle)?.is_none() {
                let cloned_at = cloned_branch(&handle)?;
                runtime
                    .block_on(tc_sync::connect(&handle, &server, &door43_repo, &cloned_at))
                    .map_err(|e| DecideError::Store(e.to_string()))?;
            }
            let internet = InternetSwitch::new();
            internet.turn_on();
            let client = Door43Client::new(server, internet)
                .map_err(|e| DecideError::Store(e.to_string()))?;
            let report = runtime.block_on(tc_sync::sync(
                &handle,
                &client,
                Some(&session),
                &tc_sync::Backoff::default(),
            ));
            Ok(match report.ended {
                Ended::Synced {
                    received,
                    confirmed,
                } => Synced::Done {
                    received: received == Received::Integrated,
                    confirmed,
                },
                Ended::Failed(failure) => Synced::Failed(
                    rocket::serde::json::to_value(&failure)
                        .map_err(|e| DecideError::Store(e.to_string()))?,
                ),
            })
        })();
        // Closing writes the decision files again from the fold, with what the sync took in.
        let closed = handle
            .close()
            .map_err(|e| DecideError::Store(e.to_string()));
        let synced = synced?;
        closed?;
        Ok(synced)
    }

    /// Opens the project at `repo` for writing.
    fn open(&self, repo: &Path) -> Result<ProjectHandle, DecideError> {
        let handle = self
            .store
            .open(&self.repos.join(repo), &OpenOptions::default())
            .map_err(|e| match e {
                OpenError::NotAProject => DecideError::NotTc,
                other => DecideError::Store(other.to_string()),
            })?;
        if let Mode::ReadOnly(reason) = handle.facts().mode {
            let _ = handle.close();
            return Err(DecideError::Store(format!(
                "the project is open read-only: {reason:?}"
            )));
        }
        Ok(handle)
    }
}

/// How a sync ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Synced {
    /// The project and Door43 hold each other's work. `received`: teammates' work came in.
    /// `confirmed`: Door43's branch was read back at the pushed commit.
    Done { received: bool, confirmed: bool },
    /// tC4's `SyncFailure`, as its JSON (`{"type": "beforeIntake", "value": {"type": "offline"}}`).
    Failed(rocket::serde::json::Value),
}

/// The Door43 host and repository of a Pankosmia repo path `<host>/<owner>/<name>`.
fn door43_of(repo: &Path) -> Result<(String, RepoRef), DecideError> {
    let parts: Vec<&str> = repo.iter().filter_map(|p| p.to_str()).collect();
    let [host, owner, name] = parts.as_slice() else {
        return Err(bad(format!(
            "{} is not a Door43 repository",
            repo.display()
        )));
    };
    let door43_repo = format!("{owner}/{name}")
        .parse()
        .map_err(|_| bad(format!("{owner}/{name} is not a Door43 repository")))?;
    Ok(((*host).to_owned(), door43_repo))
}

fn history(handle: &ProjectHandle) -> Result<git2::Repository, DecideError> {
    let git_dir = handle
        .facts()
        .git_dir
        .ok_or_else(|| DecideError::Store("the project has no git history".to_owned()))?;
    git2::Repository::open(git_dir).map_err(|e| DecideError::Store(e.message().to_owned()))
}

/// The branch the project syncs (`tc.branch`), once it is connected.
fn branch_of(handle: &ProjectHandle) -> Result<Option<String>, DecideError> {
    let config = history(handle)?
        .config()
        .map_err(|e| DecideError::Store(e.message().to_owned()))?;
    Ok(config.get_string("tc.branch").ok())
}

/// The branch Pankosmia cloned: Door43's default branch, checked out.
fn cloned_branch(handle: &ProjectHandle) -> Result<String, DecideError> {
    let history = history(handle)?;
    let head = history
        .head()
        .map_err(|e| DecideError::Store(e.message().to_owned()))?;
    head.shorthand()
        .ok()
        .map(str::to_owned)
        .ok_or_else(|| DecideError::Store("the project is on no branch".to_owned()))
}

/// Why a decision was not recorded.
#[derive(Debug, thiserror::Error)]
pub enum DecideError {
    #[error("this project is not in the new translationCore's format")]
    NotTc,
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Store(String),
}

impl DecideError {
    fn status(&self) -> Status {
        match self {
            Self::NotTc => Status::Conflict,
            Self::BadRequest(_) => Status::BadRequest,
            Self::Store(_) => Status::InternalServerError,
        }
    }
}

/// The resource the check list came from (STORAGE.md §5.4 `resource`).
#[derive(Debug, Deserialize)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Resource {
    pub repo_path: String,
    pub sha: String,
}

/// One tC4 selection, as the decision files write it.
#[derive(Debug, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct Selected {
    pub text: String,
    pub occurrence: u32,
    pub occurrences: u32,
}

/// What the check screen records: the check (its tC4 `contextId` and `category`), the list's
/// resource, and the change: a button's status with the words (the client's `engine.patch`, tC4
/// `recordDecision`), or the words alone, saved a moment after a tap (STORAGE.md §5.4).
#[derive(Debug, Deserialize)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Decide {
    pub tool: String,
    pub context_id: rocket::serde::json::Value,
    pub category: String,
    pub resource: Resource,
    /// `valid` or `invalid`; absent when only the words changed, which keeps the status.
    pub status: Option<String>,
    /// The words, or `false` for none, as tC4 writes `selections`.
    pub selections: rocket::serde::json::Value,
    pub nothing_to_select: bool,
}

fn bad(what: impl std::fmt::Display) -> DecideError {
    DecideError::BadRequest(what.to_string())
}

impl Decide {
    /// The store's edit: the button's changes, with the check's context and category for a
    /// first decision.
    fn edit(&self) -> Result<DecisionEdit, DecideError> {
        let status = match self.status.as_deref() {
            None => None,
            Some("valid") => Some(UserStatus::Valid),
            Some("invalid") => Some(UserStatus::Invalid),
            Some(other) => return Err(bad(format!("unknown status {other:?}"))),
        };
        let selections = match &self.selections {
            rocket::serde::json::Value::Bool(false) => None,
            words => {
                let words: Vec<Selected> =
                    rocket::serde::json::from_value(words.clone()).map_err(bad)?;
                let words: Vec<Selection> = words
                    .into_iter()
                    .map(|w| Selection {
                        text: w.text,
                        occurrence: w.occurrence,
                        occurrences: w.occurrences,
                        extra: JsonMap::new(),
                    })
                    .collect();
                Some(words)
            }
        };
        let context = match tc_journal::Json::try_from(&self.context_id)
            .map_err(|e| bad(format!("contextId: {e}")))?
        {
            tc_journal::Json::Obj(map) => map,
            _ => return Err(bad("contextId is not an object")),
        };
        Ok(DecisionEdit {
            basis: Some(DecisionBasis {
                context,
                category: Some(self.category.as_str().into()),
            }),
            resource: ResourceRef {
                repo_path: self.resource.repo_path.as_str().into(),
                sha: GitOid::parse(&self.resource.sha).ok_or_else(|| bad("resource sha"))?,
            },
            changes: [
                DecisionChange::Selections(selections),
                DecisionChange::NothingToSelect(self.nothing_to_select),
            ]
            .into_iter()
            .chain(status.map(|s| DecisionChange::Status(Some(s))))
            .collect(),
        })
    }

    /// The check's key and the key of the text its words are taken from: the chapter's front
    /// for `front`, else the first verse a part names (`9` of `9-10`, which holds the span's
    /// text, STORAGE.md §0 item 3; `1` of `1a` or `1,3`). The store reads no text for a part
    /// that is not one verse or span, and records the decision against the empty text (§7.7).
    fn keys(&self) -> Result<(CheckKey, RecordKey), DecideError> {
        let tool = ToolId::parse(&self.tool)
            .ok_or_else(|| bad(format!("unknown tool {:?}", self.tool)))?;
        let field = |name: &str| {
            self.context_id
                .get(name)
                .ok_or_else(|| bad(format!("contextId has no {name}")))
        };
        let text = |v: &rocket::serde::json::Value| match v {
            rocket::serde::json::Value::String(s) => Ok(s.clone()),
            rocket::serde::json::Value::Number(n) => Ok(n.to_string()),
            other => Err(bad(format!("{other} is not a reference part"))),
        };
        let reference = field("reference")?;
        let part = |name: &str| {
            reference
                .get(name)
                .ok_or_else(|| bad(format!("reference has no {name}")))
                .and_then(text)
        };
        let book: BookId = part("bookId")?
            .to_uppercase()
            .parse()
            .map_err(|_| bad("unknown book"))?;
        let (chapter, verse) = (part("chapter")?, part("verse")?);
        let occurrence = field("occurrence")?
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .ok_or_else(|| bad("occurrence"))?;
        let check_id = field("checkId")?.as_str().ok_or_else(|| bad("checkId"))?;
        let key = CheckKey {
            tool,
            check_id: CheckId::parse(check_id).map_err(bad)?,
            target: CheckTarget::Verse {
                book,
                chapter: RefPart::parse(&chapter).map_err(bad)?,
                verse: RefPart::parse(&verse).map_err(bad)?,
            },
            occurrence,
        };
        let leading = |s: &str| {
            let digits: String = s.chars().take_while(char::is_ascii_digit).collect();
            digits.parse::<u16>().ok()
        };
        let chapter_no = leading(&chapter)
            .and_then(ChapterNo::new)
            .ok_or_else(|| bad(format!("{chapter}:{verse} names no chapter")))?;
        let text = if verse == "front" {
            RecordKey::ChapterFront(book, chapter_no)
        } else {
            let verse_no = leading(&verse)
                .and_then(VerseNo::new)
                .ok_or_else(|| bad(format!("{chapter}:{verse} names no verse")))?;
            RecordKey::Verse(book, chapter_no, verse_no)
        };
        Ok((key, text))
    }
}

#[rocket::post("/decide/<repo..>", data = "<body>")]
async fn decide(
    repo: PathBuf,
    body: Json<Decide>,
    projects: &State<Arc<Projects>>,
) -> Result<(), (Status, String)> {
    let projects = Arc::clone(projects);
    // tc-store's calls block; keep them off the server's async workers.
    rocket::tokio::task::spawn_blocking(move || projects.decide(&repo, &body))
        .await
        .map_err(|e| (Status::InternalServerError, e.to_string()))?
        .map_err(|e| (e.status(), e.to_string()))
}

/// Who syncs: the checker signed in on this phone (the client keeps the token, AGENTS.md).
#[derive(Debug, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SyncAs {
    pub username: String,
    pub token: String,
}

/// `{"synced": true, "received": …, "confirmed": …}`, or `{"synced": false, "failure": …}` with
/// tC4's `SyncFailure`.
#[rocket::post("/sync/<repo..>", data = "<body>")]
async fn sync(
    repo: PathBuf,
    body: Json<SyncAs>,
    projects: &State<Arc<Projects>>,
) -> Result<Json<rocket::serde::json::Value>, (Status, String)> {
    let session = Session {
        username: body
            .username
            .parse()
            .map_err(|_| (Status::BadRequest, "username".to_owned()))?,
        token: Token::new(body.token.clone())
            .map_err(|_| (Status::BadRequest, "token".to_owned()))?,
    };
    let projects = Arc::clone(projects);
    let runtime = rocket::tokio::runtime::Handle::current();
    let synced =
        rocket::tokio::task::spawn_blocking(move || projects.sync(&runtime, &repo, session))
            .await
            .map_err(|e| (Status::InternalServerError, e.to_string()))?
            .map_err(|e| (e.status(), e.to_string()))?;
    Ok(Json(match synced {
        Synced::Done {
            received,
            confirmed,
        } => {
            rocket::serde::json::json!({ "synced": true, "received": received, "confirmed": confirmed })
        }
        Synced::Failed(failure) => {
            rocket::serde::json::json!({ "synced": false, "failure": failure })
        }
    }))
}

/// Mounts the routes at `/api/tc`, beside Pankosmia's `/api` routes.
pub fn mount(rocket: Rocket<Build>, projects: Projects) -> Rocket<Build> {
    rocket
        .manage(Arc::new(projects))
        .mount("/api/tc", rocket::routes![decide, sync])
}
