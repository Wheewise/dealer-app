"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, isUniqueViolation, unwrapMaybe } from "@/lib/db";

const updateProfileSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  phone: z
    .string()
    .min(10, "Phone must be at least 10 digits")
    .regex(/^[+\d\s-]+$/, "Use digits, spaces, + or -"),
  district: z.string().min(2, "District is required"),
  state: z.string().min(2, "State is required"),
});

export type UpdateProfileState =
  | { ok: false; errors: Record<string, string[]> }
  | { ok: true }
  | undefined;

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    district: formData.get("district"),
    state: formData.get("state"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const normalizedPhone = normalizePhone(parsed.data.phone);
  const conflict = unwrapMaybe(
    await db
      .from("User")
      .select("id")
      .eq("phone", normalizedPhone)
      .neq("id", session.user.id)
      .limit(1)
      .maybeSingle(),
    "updateProfile: phone conflict",
  );
  if (conflict) {
    return { ok: false, errors: { phone: ["Phone number already in use"] } };
  }

  // The check above races; User_phone_key is what actually decides, so a
  // concurrent claim of the same number surfaces as a field error.
  const { error } = await db
    .from("User")
    .update({
      name: parsed.data.name,
      phone: normalizedPhone,
      district: parsed.data.district,
      state: parsed.data.state,
    })
    .eq("id", session.user.id);
  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, errors: { phone: ["Phone number already in use"] } };
    }
    throw new Error(error.message);
  }

  revalidatePath("/profile");
  redirect("/profile");
}
