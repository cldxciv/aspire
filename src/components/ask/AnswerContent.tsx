import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { parseAnswer, type BlockNode, type InlineLine, type InlineNode } from "@/lib/ask/markdown";

/**
 * Renders a Rancho answer (the AI doubt solver, formerly "Ask Aspire") from the whitelist parser in src/lib/ask/markdown.ts.
 * Model output only ever becomes React text children (escaped by React); no HTML is injected.
 */

function Inline({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.value;
      case "code":
        return (
          <code key={index} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.92em] text-navy">
            {node.value}
          </code>
        );
      case "sup":
        return <sup key={index}>{node.value}</sup>;
      case "strong":
        return (
          <strong key={index} className="font-bold text-navy">
            <Inline nodes={node.children} />
          </strong>
        );
      case "em":
        return (
          <em key={index}>
            <Inline nodes={node.children} />
          </em>
        );
    }
  });
}

function Lines({ lines }: { lines: InlineLine[] }) {
  return lines.map((line, index) => (
    <span key={index}>
      {index > 0 && <br />}
      <Inline nodes={line} />
    </span>
  ));
}

function Block({ block }: { block: BlockNode }) {
  switch (block.type) {
    case "heading":
      return block.level === 3 ? (
        <h3 className="mt-5 text-lg font-extrabold text-navy first:mt-0">
          <Inline nodes={block.content} />
        </h3>
      ) : (
        <h4 className="mt-4 font-bold text-navy first:mt-0">
          <Inline nodes={block.content} />
        </h4>
      );
    case "paragraph":
      return block.final ? (
        <p className="my-4 rounded-control border border-[#f2dfa0] bg-gold-soft px-4 py-3 text-ink">
          <Lines lines={block.lines} />
        </p>
      ) : (
        <p className="my-3 first:mt-0">
          <Lines lines={block.lines} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className="pl-1">
          <Lines lines={item} />
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start} className="my-3 list-decimal space-y-2 pl-6 marker:font-bold marker:text-blue">
          {items}
        </ol>
      ) : (
        <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-blue">{items}</ul>
      );
    }
    case "code":
      return (
        <pre className="my-3 overflow-x-auto rounded-control bg-surface p-3 text-sm leading-relaxed text-ink">
          <code className="font-mono">{block.value}</code>
        </pre>
      );
    case "rule":
      return <hr className="my-4 border-line" />;
  }
}

export function AnswerContent({ text, className }: { text: string; className?: string }) {
  const blocks = parseAnswer(text);
  return (
    <div className={cn("min-w-0 break-words text-[15.5px] leading-7 text-ink", className)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
