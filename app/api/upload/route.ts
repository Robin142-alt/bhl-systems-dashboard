import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  try {
    const data = await req.formData();
    const file: File | null = data.get("file") as unknown as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 1. Turn the file into a format the computer can save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 2. Give the file a unique name so it doesn't get lost
    const uniqueName = `${Date.now()}-${file.name}`;
    const filePath = path.join(process.cwd(), "public/uploads/certificates", uniqueName);

    // 3. Save it to the folder
    await writeFile(filePath, buffer);
    
    // 4. Send back the link so the database can remember it
    const fileUrl = `/uploads/certificates/${uniqueName}`;
    return NextResponse.json({ fileUrl });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}