use std::time::{Duration, Instant};
use tauri_plugin_log::log::{info, warn};

async fn try_reaching(port: u16, per_request_timeout_ms: u64) -> Option<u16> {
    let url = format!("http://127.0.0.1:{}/api/version", port);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(per_request_timeout_ms))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            warn!("try_reaching: failed to build client for port {port}: {e}");
            return None;
        }
    };

    match client
        .get(&url)
        .header("Cache-Control", "no-store")
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            info!("try_reaching: success on port {port} (status {})", res.status());
            Some(port)
        }
        Ok(res) => {
            warn!("try_reaching: port {port} responded with status {}", res.status());
            None
        }
        Err(e) => {
            warn!("try_reaching: port {port} error: {e}");
            None
        }
    }
}

#[tauri::command]
pub async fn wait_for_server(
    candidate_ports: Vec<u16>,
    overall_timeout_ms: u64,
    per_request_timeout_ms: u64,
    interval_ms: u64,
) -> Option<u16> {
    let deadline = Instant::now() + Duration::from_millis(overall_timeout_ms);

    while Instant::now() < deadline {
        for &port in &candidate_ports {
            if let Some(ready_port) = try_reaching(port, per_request_timeout_ms).await {
                return Some(ready_port);
            }
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }

        tokio::time::sleep(std::cmp::min(
            Duration::from_millis(interval_ms),
            remaining,
        ))
        .await;
    }

    None
}