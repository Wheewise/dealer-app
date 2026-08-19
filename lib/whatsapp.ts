export function whatsappLink(phone: string | null | undefined, text: string) {
  if (!phone) return null;
  const num = phone.replace(/[^\d]/g, "");
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
