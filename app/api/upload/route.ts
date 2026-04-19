import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
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
    
    // Use /tmp on Vercel (serverless has a writable /tmp directory)
    const uploadDir = process.env.VERCEL 
      ? path.join("/tmp", "uploads", "certificates")
      : path.join(process.cwd(), "public", "uploads", "certificates");

    // 3. Ensure the directory exists
    await mkdir(uploadDir, { recursive: true });

    // 4. Save the file
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer);
    
    // 5. Send back the link
    // Note: On Vercel, /tmp files are ephemeral. For production,
    // consider using a cloud storage service (S3, Vercel Blob, etc.)
    const fileUrl = process.env.VERCEL 
      ? `/tmp/uploads/certificates/${uniqueName}` 
      : `/uploads/certificates/${uniqueName}`;
    
    return NextResponse.json({ fileUrl });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed. File storage may not be available." }, { status: 500 });
  }
}