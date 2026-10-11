// Speaker notes of a .pptx, in slide order. The renderer draws slides only, so
// the notes are read straight from the package:
// presentation.xml (slide order) → slide → its notesSlide → the body placeholder's text.
import JSZip from "jszip";

const RELS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

/** Part path of a relationship target, resolved against the part that owns the .rels. */
function resolvePart(ownerPath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ownerPath.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== "." && segment !== "") parts.push(segment);
  }
  return parts.join("/");
}

function relsPathOf(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  return `${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`;
}

async function readRels(zip: JSZip, partPath: string): Promise<Element[]> {
  const text = await zip.file(relsPathOf(partPath))?.async("string");
  return text ? [...parseXml(text).getElementsByTagNameNS("*", "Relationship")] : [];
}

/** Text of a notes slide's body placeholder, paragraphs joined by newlines. */
function notesText(doc: Document): string {
  for (const shape of doc.getElementsByTagNameNS("*", "sp")) {
    const placeholder = shape.getElementsByTagNameNS("*", "ph")[0];
    if (placeholder?.getAttribute("type") !== "body") continue;
    return [...shape.getElementsByTagNameNS("*", "p")]
      .map((p) => [...p.getElementsByTagNameNS("*", "t")].map((t) => t.textContent ?? "").join(""))
      .join("\n")
      .trim();
  }
  return "";
}

export async function readSpeakerNotes(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const presentationPath = "ppt/presentation.xml";
  const presentation = await zip.file(presentationPath)?.async("string");
  if (!presentation) return [];

  const targets = new Map((await readRels(zip, presentationPath)).map((r) => [r.getAttribute("Id"), r.getAttribute("Target")]));
  const slideIds = [...parseXml(presentation).getElementsByTagNameNS("*", "sldId")];

  return Promise.all(
    slideIds.map(async (sldId) => {
      const target = targets.get(sldId.getAttributeNS(RELS_NS, "id"));
      if (!target) return "";
      const slidePath = resolvePart(presentationPath, target);
      const notesRel = (await readRels(zip, slidePath)).find((r) => r.getAttribute("Type")?.endsWith("/notesSlide"));
      const notesTarget = notesRel?.getAttribute("Target");
      if (!notesTarget) return "";
      const notes = await zip.file(resolvePart(slidePath, notesTarget))?.async("string");
      return notes ? notesText(parseXml(notes)) : "";
    }),
  );
}
