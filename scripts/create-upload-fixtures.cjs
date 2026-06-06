/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const outputDir = path.join(process.cwd(), ".tmp-upload-tests");
const resumeText =
  "Resume text with enough readable characters for demo validation. React Next APIs data analysis A/B testing agent design.";

function createPdf() {
  const pdfFixture = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "test",
    "data",
    "01-valid.pdf",
  );

  fs.copyFileSync(pdfFixture, path.join(outputDir, "test-resume.pdf"));
}

async function createDocx() {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );

  zip
    .folder("_rels")
    .file(
      ".rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );

  zip
    .folder("word")
    .file(
      "document.xml",
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${resumeText}</w:t></w:r></w:p></w:body></w:document>`,
    );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  fs.writeFileSync(path.join(outputDir, "test-resume.docx"), buffer);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  createPdf();
  await createDocx();
  console.log(`Created upload fixtures in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
