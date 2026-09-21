import { NextResponse } from "next/server";
import { requireProfile } from "@/server/auth";
import { userQuery, runCommand } from "@/server/database";
import {
  storeFile,
  readPrivateFile,
  removePrivateFile,
} from "@/server/storage";
import { validateFile } from "@/validation/booking";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin)
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new Error("Maximum file size is 10 MB");
    const { profile } = await requireProfile();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Select a file");
    validateFile(file);
    const id = String(form.get("booking_id"));
    const category = String(form.get("category"));
    if (
      ![
        "script",
        "content_plan",
        "mood_board",
        "reference",
        "supporting",
      ].includes(category)
    )
      throw new Error("Invalid category");
    const [booking] = await userQuery<{ id: string; organization_id: string }>(
      profile.id,
      "select id,organization_id from bookings where id=$1",
      [id],
    );
    if (!booking) throw new Error("Booking not found");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = Buffer.from(bytes.subarray(0, 12));
    const valid =
      file.type === "application/pdf"
        ? header.subarray(0, 5).toString() === "%PDF-"
        : file.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : file.type === "image/png"
            ? header
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : file.type === "image/webp"
              ? header.subarray(0, 4).toString() === "RIFF" &&
                header.subarray(8, 12).toString() === "WEBP"
              : file.type === "text/plain"
                ? !bytes.includes(0)
                : bytes[0] === 80 && bytes[1] === 75;
    if (!valid)
      throw new Error("File content does not match its declared type");
    const path = `${booking.organization_id}/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storeFile(path, bytes);
    let fileId: string;
    try {
      fileId = await runCommand(profile.id, "register_booking_file", {
        input: {
          booking_id: id,
          file_name: file.name,
          storage_path: path,
          file_type: file.type,
          category,
        },
      });
    } catch (error) {
      await removePrivateFile(path);
      throw error;
    }
    return NextResponse.json({ id: fileId });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
export async function GET(request: Request) {
  try {
    const { profile } = await requireProfile();
    const id = new URL(request.url).searchParams.get("id");
    const [file] = await userQuery<{
      storage_path: string;
      file_name: string;
      file_type: string;
    }>(
      profile.id,
      "select storage_path,file_name,file_type from booking_files where id=$1",
      [id],
    );
    if (!file)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bytes = await readPrivateFile(file.storage_path);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.file_type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 403 });
  }
}
