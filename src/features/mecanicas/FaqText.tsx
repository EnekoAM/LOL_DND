import type { ReactNode } from 'react';

/**
 * Formato ligero de las Mecánicas, sin HTML: una línea en blanco separa párrafos,
 * «- » hace lista, «1. » lista numerada y **texto** va en negrita.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, index) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push(<strong key={`${keyBase}-${index}`}>{part.slice(2, -2)}</strong>);
    } else {
      out.push(part);
    }
  });
  return out;
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ kind: 'p', lines: [] }); // separador; los vacíos se quitan al final
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (BULLET.test(line)) {
      const text = line.replace(BULLET, '');
      if (last?.kind === 'ul') last.items.push(text);
      else blocks.push({ kind: 'ul', items: [text] });
    } else if (NUMBERED.test(line)) {
      const text = line.replace(NUMBERED, '');
      if (last?.kind === 'ol') last.items.push(text);
      else blocks.push({ kind: 'ol', items: [text] });
    } else if (last?.kind === 'p' && last.lines.length > 0) {
      last.lines.push(line.trim());
    } else {
      blocks.push({ kind: 'p', lines: [line.trim()] });
    }
  }
  return blocks.filter(block => block.kind !== 'p' || block.lines.length > 0);
}

const FaqText = ({ body }: { body: string }) => (
  <div className="mec-text">
    {parse(body).map((block, index) => {
      const key = `b${index}`;
      if (block.kind === 'p') {
        return (
          <p key={key}>
            {block.lines.flatMap((line, lineIndex) => [
              ...(lineIndex ? [<br key={`${key}-br${lineIndex}`} />] : []),
              ...inline(line, `${key}-${lineIndex}`),
            ])}
          </p>
        );
      }
      const items = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>);
      return block.kind === 'ul' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
    })}
  </div>
);

export default FaqText;
