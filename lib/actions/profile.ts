"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  const conflict = await prisma.user.findFirst({
    where: { phone: normalizedPhone, NOT: { id: session.user.id } },
    select: { id: true },
  });
  if (conflict) {
    return { ok: false, errors: { phone: ["Phone number already in use"] } };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      phone: normalizedPhone,
      district: parsed.data.district,
      state: parsed.data.state,
    },
  });

  revalidatePath("/profile");
  redirect("/profile");
}
