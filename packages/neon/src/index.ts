import "server-only";
import { neon } from "@neondatabase/serverless";

// Chat message content AND all app notifications live here instead of
// Supabase — thread membership (who's in an enquiry, which vehicle/dealer
// it's about) stays in Supabase with real foreign keys; message bodies and
// notifications don't need that relational integrity as much as they need
// to be cheap to write and read. Since Neon has no RLS/auth of its own,
// every caller MUST verify the current user is authorized (a participant
// in the enquiry, the dealer who owns the vehicle, etc. — via Supabase)
// before calling any of these — nothing here checks that on its own.
const sql = neon(process.env.NEON_DATABASE_URL!);

export type ChatMessage = {
  id: string;
  enquiry_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  profile_id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getMessages(enquiryId: string): Promise<ChatMessage[]> {
  const rows = await sql`
    select id, enquiry_id, sender_id, body, created_at
    from messages
    where enquiry_id = ${enquiryId}
    order by created_at asc
  `;
  return rows as ChatMessage[];
}

export async function insertMessage(enquiryId: string, senderId: string, body: string): Promise<void> {
  await sql`
    insert into messages (enquiry_id, sender_id, body)
    values (${enquiryId}, ${senderId}, ${body})
  `;
}

export async function insertNotification(
  profileId: string,
  type: string,
  title: string,
  body: string | null,
  href: string | null,
): Promise<void> {
  await sql`
    insert into notifications (profile_id, type, title, body, href)
    values (${profileId}, ${type}, ${title}, ${body}, ${href})
  `;
}

export async function getNotifications(profileId: string, limit = 20): Promise<NotificationRow[]> {
  const rows = await sql`
    select id, profile_id, type, title, body, href, read_at, created_at
    from notifications
    where profile_id = ${profileId}
    order by created_at desc
    limit ${limit}
  `;
  return rows as NotificationRow[];
}

export async function markNotificationsRead(profileId: string): Promise<void> {
  await sql`
    update notifications
    set read_at = now()
    where profile_id = ${profileId} and read_at is null
  `;
}
