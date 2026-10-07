import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { useId } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "quiet";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classes("ui-button", `ui-button--${variant}`, className)}
      type={type}
      {...props}
    />
  );
}

export function TextLink({
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={classes("ui-link", className)} {...props} />;
}

interface PageContainerProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "header" | "footer" | "section";
}

export function PageContainer({
  as: Element = "div",
  className,
  ...props
}: PageContainerProps) {
  return <Element className={classes("ui-container", className)} {...props} />;
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "div" | "section";
}

export function Card({
  as: Element = "div",
  className,
  ...props
}: CardProps) {
  return <Element className={classes("ui-card", className)} {...props} />;
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "brand" | "success" | "warning";
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={classes("ui-badge", `ui-badge--${tone}`, className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={classes("ui-label", className)} {...props} />;
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes("ui-input", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="ui-select-wrap">
      <select className={classes("ui-select", className)} {...props}>
        {children}
      </select>
      <span className="ui-select-indicator" aria-hidden="true">⌄</span>
    </span>
  );
}

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
}

export function Alert({
  tone = "info",
  className,
  role,
  ...props
}: AlertProps) {
  return (
    <div
      className={classes("ui-alert", `ui-alert--${tone}`, className)}
      role={role ?? (tone === "error" ? "alert" : "status")}
      {...props}
    />
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="ui-loading" role="status" aria-label={label}>
      <span className="ui-loading__sr-only">{label}</span>
      <span className="ui-skeleton ui-skeleton--heading" />
      <span className="ui-skeleton" />
      <span className="ui-skeleton ui-skeleton--short" />
    </div>
  );
}

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div className={classes("ui-empty-state", className)} {...props}>
      {icon && <span className="ui-empty-state__icon" aria-hidden="true">{icon}</span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
}

export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
}: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className="ui-drawer-layer">
      <button
        className="ui-drawer-backdrop"
        type="button"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className={classes("ui-drawer", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className={classes("ui-drawer__header", headerClassName)}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <Button
            className="ui-drawer__close"
            variant="quiet"
            aria-label="Close panel"
            onClick={onClose}
          >
            <span aria-hidden="true">&times;</span>
          </Button>
        </header>
        <div className={classes("ui-drawer__content", contentClassName)}>
          {children}
        </div>
        {footer && (
          <footer className={classes("ui-drawer__footer", footerClassName)}>
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
