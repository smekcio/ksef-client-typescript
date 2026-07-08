import { DOMParser } from "@xmldom/xmldom";

interface XmlNodeListLike {
  length: number;
  item(index: number): XmlLikeNode | null;
}

interface XmlLikeNode {
  nodeName: string;
  nodeType: number;
  ELEMENT_NODE: number;
  childNodes: XmlNodeListLike;
  getAttribute?(name: string): string | null;
  getElementsByTagNameNS?(namespace: string, localName: string): XmlNodeListLike;
}

type XmlLikeElement = XmlLikeNode & {
  getAttribute(name: string): string | null;
  getElementsByTagNameNS(namespace: string, localName: string): XmlNodeListLike;
};

export class XsdElement {
  readonly path: string;
  readonly name: string;
  readonly typeName: string | undefined;
  readonly minOccurs: string;
  readonly maxOccurs: string;
  readonly choices: number;
  readonly enumValues: string[];

  constructor(value: {
    path: string;
    name: string;
    typeName?: string;
    minOccurs?: string;
    maxOccurs?: string;
    choices?: number;
    enumValues?: string[];
  }) {
    this.path = value.path;
    this.name = value.name;
    this.typeName = value.typeName;
    this.minOccurs = value.minOccurs ?? "1";
    this.maxOccurs = value.maxOccurs ?? "1";
    this.choices = value.choices ?? 0;
    this.enumValues = [...(value.enumValues ?? [])];
  }
}

function localName(nodeName: string): string {
  const index = nodeName.indexOf(":");
  return index >= 0 ? nodeName.slice(index + 1) : nodeName;
}

function asElement(node: XmlLikeNode | null): XmlLikeElement | null {
  if (!node || node.nodeType !== node.ELEMENT_NODE) {
    return null;
  }
  return node as XmlLikeElement;
}

function elementChildren(node: XmlLikeNode): XmlLikeElement[] {
  const out: XmlLikeElement[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = asElement(node.childNodes.item(i));
    if (child) {
      out.push(child);
    }
  }
  return out;
}

function walkSimpleTypeEnums(root: XmlLikeElement): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const simpleTypes = root.getElementsByTagNameNS("*", "simpleType");
  for (let i = 0; i < simpleTypes.length; i += 1) {
    const simpleType = simpleTypes.item(i) as XmlLikeElement;
    const name = simpleType.getAttribute("name");
    if (!name) {
      continue;
    }
    const values: string[] = [];
    const enumNodes = simpleType.getElementsByTagNameNS("*", "enumeration");
    for (let enumIndex = 0; enumIndex < enumNodes.length; enumIndex += 1) {
      const enumNode = asElement(enumNodes.item(enumIndex));
      const value = enumNode?.getAttribute("value");
      if (value) {
        values.push(value);
      }
    }
    if (values.length > 0) {
      enums.set(name, values);
    }
  }
  return enums;
}

function countChoices(node: XmlLikeElement): number {
  return node.getElementsByTagNameNS("*", "choice").length;
}

function walkParticles(
  node: XmlLikeElement,
  path: string,
  out: XsdElement[],
  enums: Map<string, string[]>,
): void {
  for (const child of elementChildren(node)) {
    const childLocalName = localName(child.nodeName);
    if (childLocalName === "element") {
      const name = child.getAttribute("name");
      if (name) {
        walkElement(child, `${path}/${name}`, out, enums);
      }
      continue;
    }
    if (childLocalName === "sequence" || childLocalName === "choice" || childLocalName === "all") {
      walkParticles(child, path, out, enums);
    }
  }
}

function walkElement(
  node: XmlLikeElement,
  path: string,
  out: XsdElement[],
  enums: Map<string, string[]>,
): void {
  const typeName = node.getAttribute("type") || undefined;
  const localTypeName = typeName ? localName(typeName) : undefined;
  out.push(
    new XsdElement({
      path,
      name: path.slice(path.lastIndexOf("/") + 1),
      ...(typeName ? { typeName } : {}),
      minOccurs: node.getAttribute("minOccurs") || "1",
      maxOccurs: node.getAttribute("maxOccurs") || "1",
      choices: countChoices(node),
      enumValues: localTypeName ? enums.get(localTypeName) ?? [] : [],
    }),
  );

  for (const child of elementChildren(node)) {
    if (localName(child.nodeName) === "complexType") {
      walkParticles(child, path, out, enums);
    }
  }
}

export function parseFa3XsdElements(schemaText: string): XsdElement[] {
  const doc = new DOMParser().parseFromString(schemaText, "text/xml");
  const root = doc?.documentElement;
  if (!root) {
    return [];
  }
  const enums = walkSimpleTypeEnums(root);
  const allElements = root.getElementsByTagNameNS("*", "element");
  let fakturaElement: XmlLikeElement | null = null;
  for (let i = 0; i < allElements.length; i += 1) {
    const candidate = asElement(allElements.item(i));
    if (candidate?.getAttribute("name") === "Faktura") {
      fakturaElement = candidate;
      break;
    }
  }
  if (!fakturaElement) {
    return [];
  }
  const out: XsdElement[] = [];
  walkElement(fakturaElement, "/Faktura", out, enums);
  return out;
}

export const parse_fa3_xsd_elements = parseFa3XsdElements;
