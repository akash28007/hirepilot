// Resume fields come from an LLM and may be arrays of strings OR arrays of
// objects (e.g. { name, techStack, description }). Joining objects directly
// produces "[object Object]" in the prompt, so flatten each item to text.
export const formatList = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "Not provided";

  return items
    .map((item) => {
      if (item == null) return "";
      if (typeof item !== "object") return String(item);
      return Object.values(item)
        .filter((v) => v !== null && v !== undefined && v !== "")
        .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
        .join(" – ");
    })
    .filter(Boolean)
    .join("; ");
};
