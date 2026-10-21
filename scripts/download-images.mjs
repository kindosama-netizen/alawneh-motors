import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = path.join(root, "public", "media");
const cdpPath = process.argv[2] || "C:\\Users\\DRT\\.cursor\\browser-logs\\cdp-response-Runtime.evaluate-2026-10-21T17-21-18-395Z.json";

const brand = {
  cover: "https://scontent.famm10-1.fna.fbcdn.net/v/t39.99422-6/787191532_2293228278145324_8023455290222677341_n.png?stp=dst-jpg_tt6&cstp=mx2048x1536&ctp=s2048x1536&_nc_cat=102&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=cc71e4&_nc_ohc=gFmrAvR4TP0Q7kNvwGRYCOE&_nc_oc=AdrO9RmBWFnrHE3iaGLi7EumA717xjZq58awH2Grqi2xdnAodD5yB0KZjfM-W__Br9cvRL-4Us25RMBrE7GfRDCU&_nc_zt=14&_nc_ht=scontent.famm10-1.fna&_nc_gid=m1at88Y-0w4VUnowZc0odg&_nc_ss=7e2a8&oh=00_AQMhoe2hGGXTGdo8ZshD-Gvlth-RVovX5CVxCa7wvxqbiQ&oe=6ADEDA0B",
  profile: "https://scontent.famm10-1.fna.fbcdn.net/v/t39.30808-1/704992482_1379880954169247_7521806890899245753_n.jpg?stp=dst-jpg_tt6&cstp=mx2048x2043&ctp=s960x960&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=2d3e12&_nc_ohc=kf4Syu80O3UQ7kNvwHeFoQ5&_nc_oc=AdrgZy7ouEuqNXUf9GJOtXCo12giH27jDEve1OQe2tTa9KSHWFEKPKKsR0l777_vcE8dce44iFKoh7NQCjpoWmRF&_nc_zt=24&_nc_ht=scontent.famm10-1.fna&_nc_gid=5jqoZyCaZfRlbnhduV9sHA&_nc_ss=7e2a8&oh=00_AQNn02jTpqcHZOYqMdyk-rQP-J6BRpydgRURD-NBn9H-Fg&oe=6ADEE3DC"
};

function enlarge(url) {
  return url.replace(/ctp=s\d+x\d+/, "ctp=s1600x1600");
}

async function fetchImage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://www.facebook.com/"
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 90)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4000) throw new Error(`too small ${buf.length}`);
  return buf;
}

async function saveImage(url, dest) {
  const candidates = [...new Set([enlarge(url), url])];
  let lastError;
  for (const candidate of candidates) {
    try {
      const buf = await fetchImage(candidate);
      await sharp(buf)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(dest);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function pool(items, limit, worker) {
  const queue = [...items];
  const running = new Set();
  const out = [];
  while (queue.length || running.size) {
    while (queue.length && running.size < limit) {
      const item = queue.shift();
      const job = worker(item).then((value) => {
        running.delete(job);
        return value;
      });
      running.add(job);
      out.push(job);
    }
    if (running.size) await Promise.race(running);
  }
  return Promise.all(out);
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const cdp = JSON.parse(fs.readFileSync(cdpPath, "utf8"));
const posts = cdp.result.value;

fs.mkdirSync(mediaDir, { recursive: true });

const jobs = [
  { url: brand.cover, dest: path.join(mediaDir, "cover.jpg") },
  { url: brand.profile, dest: path.join(mediaDir, "profile.jpg") }
];

for (const car of catalog) {
  let urls = car.extraImages || [];
  if (car.match) {
    const post = posts.find((p) => p.k === car.match);
    if (!post) throw new Error(`missing post ${car.match}`);
    urls = post.imgs.slice(0, 4);
  }
  car.images = [];
  urls.forEach((url, index) => {
    const name = `${car.id}-${index + 1}.jpg`;
    car.images.push(`/media/${name}`);
    jobs.push({ url, dest: path.join(mediaDir, name) });
  });
  delete car.match;
  delete car.extraImages;
}

const results = await pool(jobs, 5, async (job) => {
  try {
    await saveImage(job.url, job.dest);
    console.log("ok", path.basename(job.dest));
    return true;
  } catch (error) {
    console.error("fail", path.basename(job.dest), error.message);
    return false;
  }
});

for (const car of catalog) {
  car.images = (car.images || []).filter((url) => fs.existsSync(path.join(mediaDir, path.basename(url))));
}
const failed = results.filter((ok) => !ok).length;
fs.writeFileSync(path.join(root, "data", "cars.json"), JSON.stringify(catalog, null, 2));
console.log(`saved ${catalog.length} cars, failed images: ${failed}`);
if (failed) process.exitCode = 1;
