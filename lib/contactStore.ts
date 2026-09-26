import fs from "fs/promises";
import path from "path";

const CONTACTS_FILE = path.join(process.cwd(), ".monday_contacts.json");

export interface ContactBook {
  userPhone?: string;
  contacts: Record<string, string>;
}

export function normalizePhone(raw: string): string {
  let cleaned = (raw || "").replace(/[^\d+]/g, "").trim();
  if (!cleaned.startsWith("+") && cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  return cleaned.replace(/^\+/, "");
}

export async function getContacts(): Promise<ContactBook> {
  try {
    const data = await fs.readFile(CONTACTS_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return {
      userPhone: "",
      contacts: {},
    };
  }
}

export async function saveContacts(book: ContactBook): Promise<void> {
  try {
    await fs.writeFile(CONTACTS_FILE, JSON.stringify(book, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to persist contacts file:", err);
  }
}

export async function setUserPhone(phone: string): Promise<string> {
  const clean = normalizePhone(phone);
  const book = await getContacts();
  book.userPhone = clean;
  book.contacts["you"] = clean;
  book.contacts["self"] = clean;
  book.contacts["nani"] = clean;
  book.contacts["boss"] = clean;
  book.contacts["me"] = clean;
  book.contacts["myself"] = clean;
  await saveContacts(book);
  return clean;
}

export async function saveContact(name: string, phone: string): Promise<string> {
  const clean = normalizePhone(phone);
  const book = await getContacts();
  const key = name.toLowerCase().trim();
  book.contacts[key] = clean;
  if (["you", "self", "nani", "boss", "me", "myself"].includes(key)) {
    book.userPhone = clean;
  }
  await saveContacts(book);
  return clean;
}

export async function resolveContactPhone(target: string): Promise<string | null> {
  const raw = (target || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length >= 10) {
    return normalizePhone(raw);
  }

  const book = await getContacts();
  const key = raw.toLowerCase().trim();

  if (book.contacts) {
    if (book.contacts[key]) {
      return book.contacts[key];
    }
    for (const [k, val] of Object.entries(book.contacts)) {
      if (k.toLowerCase().trim() === key) {
        return val;
      }
    }
  }

  if (["you", "self", "nani", "boss", "me", "myself"].includes(key) && book.userPhone) {
    return book.userPhone;
  }

  return null;
}
