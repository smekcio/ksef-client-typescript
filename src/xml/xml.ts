import { XMLBuilder, XMLParser } from "fast-xml-parser";

export type XmlDocument = Array<Record<string, unknown>>;
export type XmlValue = string | number | boolean | null | XmlObject | XmlValue[];
export type XmlObject = { [key: string]: XmlValue };

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  allowBooleanAttributes: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  format: false,
  suppressBooleanAttributes: false,
  suppressEmptyNode: false,
  processEntities: true,
  declaration: {
    include: true,
    encoding: "utf-8",
  },
} as ConstructorParameters<typeof XMLBuilder>[0]);

function createObjectBuilder(pretty = false): XMLBuilder {
  return new XMLBuilder({
    ignoreAttributes: false,
    preserveOrder: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: pretty,
    suppressBooleanAttributes: false,
    suppressEmptyNode: false,
    processEntities: true,
    declaration: {
      include: true,
      encoding: "utf-8",
    },
  } as ConstructorParameters<typeof XMLBuilder>[0]);
}

export function parseXml(xml: string): XmlDocument {
  return parser.parse(xml) as XmlDocument;
}

export function buildXml(document: XmlDocument): string {
  return builder.build(document);
}

export function buildXmlFromObject(document: XmlObject, options?: { pretty?: boolean }): string {
  return createObjectBuilder(options?.pretty).build(document);
}
