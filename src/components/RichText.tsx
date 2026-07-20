import { renderRichText } from "../lib/rich-text";

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return <p className={`whitespace-pre-wrap ${className}`}>{renderRichText(text)}</p>;
}
