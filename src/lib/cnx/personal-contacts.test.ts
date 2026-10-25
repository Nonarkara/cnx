import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countPersonalContacts, redactPersonalContactText, redactDatasetMetadata } from "../../../scripts/redact-personal-contacts.mjs";

const DATA = join(process.cwd(), "public/data");

function filesUnder(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, acc);
    else if (/\.(json|geojson|csv|tsv)$/i.test(name)) acc.push(path);
  }
  return acc;
}

describe("redactPersonalContactText", () => {
  it("redacts display metadata on rebake without corrupting resource identifiers or links", () => {
    const source = { id: "0812345678", notesTh: "โทร 0812345678", notesEn: "Contact person@gmail.com", resources: [{ name: "Desk 0891234567", url: "https://example.org/0812345678.csv" }], tags: ["Contact person@gmail.com"] };
    const safe = redactDatasetMetadata(source);
    expect(countPersonalContacts(JSON.stringify({ notes: [safe.notesTh, safe.notesEn], tags: safe.tags, name: safe.resources[0].name }))).toEqual({ mobiles: 0, emails: 0 });
    expect(safe.id).toBe(source.id);
    expect(safe.resources[0].url).toBe(source.resources[0].url);
    expect(source.notesTh).toContain("0812345678");
  });
  it("removes personal mobiles and keeps an organisation landline in the same cell", () => {
    expect(redactPersonalContactText("081-234-5678")).toBe("");
    expect(redactPersonalContactText("+66 81 234 5678")).toBe("");
    expect(redactPersonalContactText("สภ.ตัวอย่าง  โทรศัพท์:053-111-222,081-234-5678")).toBe("สภ.ตัวอย่าง โทรศัพท์:053-111-222");
    expect(redactPersonalContactText("053-235595")).toBe("053-235595");
    expect(redactPersonalContactText("บ้านตัวอย่าง โทร 0891234567")).toBe("บ้านตัวอย่าง");
  });

  it("removes consumer mailboxes and keeps an organisational address", () => {
    expect(redactPersonalContactText("user@gmail.com")).toBe("");
    expect(redactPersonalContactText("user@hotmail.com")).toBe("");
    expect(redactPersonalContactText("desk@dnp.mail.go.th")).toBe("desk@dnp.mail.go.th");
    expect(redactPersonalContactText("foo@gmail.com, desk@dnp.go.th")).toBe("desk@dnp.go.th");
  });

  it("does not treat coordinates, identifiers, or ordinary words as phone numbers", () => {
    expect(redactPersonalContactText("1234567.0901234567")).toBe("1234567.0901234567");
    expect(redactPersonalContactText("c78ebc16-0891234567ab")).toBe("c78ebc16-0891234567ab");
    expect(redactPersonalContactText("โทรทัศน์")).toBe("โทรทัศน์");
    expect(redactPersonalContactText("50200")).toBe("50200");
  });
});

describe("committed public data", () => {
  it("has no personal mobiles or consumer email addresses", () => {
    const hits: string[] = [];
    for (const file of filesUnder(DATA)) {
      const counts = countPersonalContacts(readFileSync(file, "utf8"));
      if (counts.mobiles || counts.emails) hits.push(`${file} mobiles=${counts.mobiles} emails=${counts.emails}`);
    }
    const modal = readFileSync(join(process.cwd(), "src/components/CNX/CNXEmergencyModal.tsx"), "utf8");
    const modalCounts = countPersonalContacts(modal);
    if (modalCounts.mobiles || modalCounts.emails) hits.push(`CNXEmergencyModal mobiles=${modalCounts.mobiles} emails=${modalCounts.emails}`);
    expect(hits).toEqual([]);
  }, 180_000); // Cold external-volume scans on the shared relay Mac can exceed 90s; scan every file without weakening the assertions.

  it("keeps official organisation contacts and credits the publisher", () => {
    const police = readFileSync(join(DATA, "cnx/data-library/datasets/_67_73.json"), "utf8");
    expect(police).toContain("โทรศัพท์:053");
    expect(police).toContain("แหล่งที่มา: สำนักงานจังหวัดเชียงใหม่ — https://data.go.th/dataset/_67_73");

    const dnp = readFileSync(join(DATA, "cnx/data-library/datasets/gdpublish-http-portal-dnp-go-th-p.json"), "utf8");
    expect(dnp).toContain("@dnp.mail.go.th");
    expect(dnp).toContain("แหล่งที่มา: กรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช — https://data.go.th/dataset/gdpublish-http-portal-dnp-go-th-p");
    expect(dnp).not.toContain("@gmail.com");
    expect(dnp).not.toContain("@hotmail.com");

    const health = readFileSync(join(DATA, "cnx/data-library/datasets/item_0165cf6a-f01f-47cd-ba4d-a8714d775198.json"), "utf8");
    expect(health).toContain("แหล่งที่มา: สำนักงานปลัดกระทรวงสาธารณสุข");

    const centres = readFileSync(join(DATA, "cnx/data-library/datasets/https-sites-google-com-site-sunyreiynrussw3-suny-brikar-khn-phikar.json"), "utf8");
    expect(centres).toContain("แหล่งที่มา: สำนักงานส่งเสริมและสนับสนุนวิชาการ 2 ชลบุรี");

    const bus = JSON.parse(readFileSync(join(DATA, "cnx/bus-routes.geojson"), "utf8")) as {
      meta: { contactNote: string; source: string };
      stops: Array<{ operator: string }>;
    };
    expect(bus.meta.source).toContain("OpenStreetMap");
    expect(bus.meta.contactNote).toContain("OpenStreetMap (ODbL)");
    const queue = bus.stops.find((stop) => stop.operator.includes("บ้านขุนช่างเคี่ยน"));
    expect(queue?.operator).toBe("บ้านขุนช่างเคี่ยน ต.ช้างเผือก อ.เมือง จ.เชียงใหม่");

    const modal = readFileSync(join(process.cwd(), "src/components/CNX/CNXEmergencyModal.tsx"), "utf8");
    expect(modal).toContain("1567");
    expect(modal).toContain("053-235595");
    expect(modal).toContain("1669");
    expect(modal).toContain("changpuakmagazine.com/en-article/EMERGENCY/751083");
    expect(modal).toContain("chiangmailocator.com/wiki-emergency-telephone-numbers-chiang-mai-p98");
  });
});
