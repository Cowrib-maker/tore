import {
  LegalNodeKind,
  LegalSourceKind,
  type LegalDocument,
  type LegalLocator,
  type LegalNode,
} from "../../schema";
import {
  CanonicalInstrumentKind,
  CanonicalUnitRole,
  type CanonicalOutlineUnit,
  type CanonicalSourceDocument,
  type ILegalParser,
} from "../../canonical";

/**
 * Source-agnostic law parser.
 *
 * Builds a {@link LegalDocument} tree from a canonical outline.
 * Does not read HTML, PDF, or any website-specific markup.
 */
export class LawParser implements ILegalParser {
  readonly instrumentKind = CanonicalInstrumentKind.LAW;

  parse(document: CanonicalSourceDocument): LegalDocument {
    const law = document.law ?? {
      instrumentClass: "OTHER" as const,
      enactingBody: null,
    };

    return {
      identity: document.identity,
      source: {
        kind: LegalSourceKind.LAW,
        instrumentClass: law.instrumentClass,
        enactingBody: law.enactingBody,
      },
      publication: document.publication,
      temporal: document.temporal,
      hierarchy: buildHierarchy(document.outline, document.outlinePathPrefix),
      citations: [],
      relations: [],
      provenance: document.provenance,
    };
  }
}

function buildHierarchy(
  units: CanonicalOutlineUnit[],
  prefix: string,
): LegalNode[] {
  const root: LegalNode[] = [];

  let part: LegalNode | null = null;
  let chapter: LegalNode | null = null;
  let section: LegalNode | null = null;
  let article: LegalNode | null = null;
  let paragraph: LegalNode | null = null;
  let subparagraph: LegalNode | null = null;
  let leaf: LegalNode | null = null;

  for (const unit of units) {
    if (unit.role === CanonicalUnitRole.TEXT) {
      if (leaf) {
        leaf.text = joinOriginal(leaf.text, unit.text);
      } else {
        const block = makeNode({
          kind: LegalNodeKind.BLOCK,
          path: `${prefix}/preamble-${root.length + 1}`,
          order: root.length,
          original: unit.text,
          locator: null,
          heading: null,
        });

        root.push(block);
        leaf = block;
      }

      continue;
    }

    if (unit.role === CanonicalUnitRole.PART) {
      const number = unit.number ?? "1";

      part = makeNode({
        kind: LegalNodeKind.PART,
        path: `${prefix}/part-${number}`,
        order: root.length,
        original: unit.text,
        heading: unit.heading,
        locator: {
          display: unit.display,
          part: number,
        },
      });

      root.push(part);

      chapter = null;
      section = null;
      article = null;
      paragraph = null;
      subparagraph = null;
      leaf = part;

      continue;
    }

    if (unit.role === CanonicalUnitRole.CHAPTER) {
      const parent = part;
      const siblings = parent ? parent.children : root;
      const number = unit.number ?? "1";

      chapter = makeNode({
        kind: LegalNodeKind.CHAPTER,
        path: `${parent?.path ?? prefix}/chapter-${number}`,
        order: siblings.length,
        original: unit.text,
        heading: unit.heading,
        locator: {
          display: unit.display,
          part: part?.locator?.part,
          chapter: number,
        },
      });

      siblings.push(chapter);

      section = null;
      article = null;
      paragraph = null;
      subparagraph = null;
      leaf = chapter;

      continue;
    }

    if (unit.role === CanonicalUnitRole.SECTION) {
      const parent = chapter ?? part;
      const siblings = parent ? parent.children : root;
      const number = unit.number ?? "1";

      section = makeNode({
        kind: LegalNodeKind.SECTION,
        path: `${parent?.path ?? prefix}/section-${number}`,
        order: siblings.length,
        original: unit.text,
        heading: unit.heading,
        locator: {
          display: unit.display,
          part: part?.locator?.part,
          chapter: chapter?.locator?.chapter,
          section: number,
        },
      });

      siblings.push(section);

      article = null;
      paragraph = null;
      subparagraph = null;
      leaf = section;

      continue;
    }

    if (unit.role === CanonicalUnitRole.ARTICLE) {
      const parent = section ?? chapter ?? part;
      const siblings = parent ? parent.children : root;
      const number = unit.number ?? "1";

      article = makeNode({
        kind: LegalNodeKind.ARTICLE,
        path: `${parent?.path ?? prefix}/article-${number}`,
        order: siblings.length,
        original: unit.text,
        heading: unit.heading,
        locator: {
          display: unit.display,
          part: part?.locator?.part,
          chapter: chapter?.locator?.chapter,
          section: section?.locator?.section,
          article: number,
        },
      });

      siblings.push(article);

      paragraph = null;
      subparagraph = null;
      leaf = article;

      continue;
    }

    if (unit.role === CanonicalUnitRole.PARAGRAPH) {
      const parent = article;

      if (!parent) {
        appendOrBlock(root, prefix, unit.text);
        continue;
      }

      const siblings = parent.children;
      const paragraphNumber = unit.paragraph ?? unit.number ?? "1";

      paragraph = makeNode({
        kind: LegalNodeKind.PARAGRAPH,
        path: `${parent.path}/paragraph-${paragraphNumber}`,
        order: siblings.length,
        original: unit.text,
        heading: null,
        locator: {
          display: unit.display,
          part: part?.locator?.part,
          chapter: chapter?.locator?.chapter,
          section: section?.locator?.section,
          article: unit.article ?? article?.locator?.article,
          paragraph: paragraphNumber,
        },
      });

      siblings.push(paragraph);

      subparagraph = null;
      leaf = paragraph;

      continue;
    }

    if (unit.role === CanonicalUnitRole.SUBPARAGRAPH) {
      const parent = paragraph ?? article;

      if (!parent) {
        appendOrBlock(root, prefix, unit.text);
        continue;
      }

      const siblings = parent.children;
      const subparagraphNumber =
        unit.subparagraph ?? unit.number ?? "1";

      subparagraph = makeNode({
        kind: LegalNodeKind.SUBPARAGRAPH,
        path: `${parent.path}/subparagraph-${subparagraphNumber}`,
        order: siblings.length,
        original: unit.text,
        heading: null,
        locator: {
          display: unit.display,
          part: part?.locator?.part,
          chapter: chapter?.locator?.chapter,
          section: section?.locator?.section,
          article: unit.article ?? article?.locator?.article,
          paragraph:
            unit.paragraph ?? paragraph?.locator?.paragraph,
          subparagraph: subparagraphNumber,
        },
      });

      siblings.push(subparagraph);
      leaf = subparagraph;

      continue;
    }

    if (unit.role === CanonicalUnitRole.ITEM) {
      const itemParent = subparagraph ?? paragraph ?? article;

      if (!itemParent) {
        appendOrBlock(root, prefix, unit.text);
        continue;
      }

      const itemNumber = unit.item ?? unit.number ?? "1";

      const item = makeNode({
        kind: LegalNodeKind.ITEM,
        path: `${itemParent.path}/item-${itemNumber}`,
        order: itemParent.children.length,
        original: unit.text,
        heading: null,
        locator: {
          display: unit.display,
          part: part?.locator?.part,
          chapter: chapter?.locator?.chapter,
          section: section?.locator?.section,
          article:
            unit.article ?? article?.locator?.article,
          paragraph:
            unit.paragraph ?? paragraph?.locator?.paragraph,
          subparagraph:
            unit.subparagraph ??
            subparagraph?.locator?.subparagraph,
          item: itemNumber,
        },
      });

      itemParent.children.push(item);
      leaf = item;

      continue;
    }

    appendOrBlock(root, prefix, unit.text);
  }

  return root;
}

function makeNode(input: {
  kind: LegalNode["kind"];
  path: string;
  order: number;
  original: string;
  heading: string | null;
  locator: LegalLocator | null;
}): LegalNode {
  return {
    id: input.path,
    kind: input.kind,
    locator: input.locator,
    heading: input.heading,
    text: input.original,
    order: input.order,
    path: input.path,
    citations: [],
    children: [],
  };
}

function appendOrBlock(
  root: LegalNode[],
  prefix: string,
  original: string,
): void {
  const last = root[root.length - 1];
  if (last?.kind === LegalNodeKind.BLOCK) {
    last.text = joinOriginal(last.text, original);
    return;
  }
  root.push(
    makeNode({
      kind: LegalNodeKind.BLOCK,
      path: `${prefix}/preamble-${root.length + 1}`,
      order: root.length,
      original,
      locator: null,
      heading: null,
    }),
  );
}

function joinOriginal(existing: string | null, next: string): string {
  if (!existing) {
    return next;
  }
  return `${existing}\n${next}`;				
}
