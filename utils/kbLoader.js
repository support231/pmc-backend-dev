import fs from "fs";
import path from "path";

const kbRoot = path.join(process.cwd(), "KB_JSON");

let KB = [];

function getAllJsonFiles(dir) {

  let results = [];

  const list = fs.readdirSync(dir);

  for (const file of list) {

    const fullPath = path.join(dir, file);

    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {

      results = results.concat(getAllJsonFiles(fullPath));

    } else if (file.endsWith(".json")) {

      results.push(fullPath);
    }
  }

  return results;
}

export function loadKB() {

  try {

    const files = getAllJsonFiles(kbRoot);

    KB = [];

    for (const fullPath of files) {

      try {

        const rawData = fs.readFileSync(fullPath, "utf8");

        const parsed = JSON.parse(rawData);

        if (Array.isArray(parsed)) {

          KB.push(...parsed);

        } else if (parsed.sections) {

          parsed.sections.forEach(section => {

            if (section.topics) {

              section.topics.forEach(topic => {

                KB.push({
                  id: `${section.chapter}_${topic.title}`,
                  keywords: [
                    section.title,
                    topic.title
                  ],
                  topic: topic.title,
                  content: Array.isArray(topic.content)
                    ? topic.content.join(" ")
                    : topic.content || ""
                });
              });
            }
          });
        }

      } catch (err) {

        console.error("JSON PARSE ERROR:", fullPath, err.message);
      }
    }

    console.log("KB Loaded:", KB.length, "entries");

  } catch (err) {

    console.error("KB LOAD ERROR:", err);
  }
}

export function getKB() {
  return KB;
}
