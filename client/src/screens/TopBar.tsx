import type { ReactNode } from 'react';
import { t } from '../i18n';

type Props = {
  /** Where the checker is: the screen's heading. */
  title: string;
  /** A second line under the title. */
  sub?: ReactNode;
  onBack?: () => void;
  /** Makes the title a button with ▾ (the chapter selector). */
  onTitle?: () => void;
  titleTestId?: string;
  /** Buttons at the right end. */
  actions?: ReactNode;
  /** Shows the app's name above the title: the screens before a book is open. */
  brand?: boolean;
};

/** The bar at the top of every screen: back arrow, the place, and the screen's actions. */
export default function TopBar({ title, sub, onBack, onTitle, titleTestId, actions, brand }: Props) {
  return (
    <header className="topbar" role="banner">
      {onBack && (
        <button className="icon" aria-label={t('back')} onClick={onBack}>
          ←
        </button>
      )}
      <div className="topbar-place">
        {brand && (
          <div className="brand" data-testid="app-name">
            {t('appName')}
          </div>
        )}
        <h1>
          {onTitle ? (
            <button className="title-button" onClick={onTitle}>
              <span data-testid={titleTestId}>{title}</span>
              <span aria-hidden="true"> ▾</span>
            </button>
          ) : (
            <span data-testid={titleTestId}>{title}</span>
          )}
        </h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </header>
  );
}
