const WA_NUMBER = "962792066680";
const CALL_NUMBER = "+962792066680";

export function priceText(car) {
  if (car.priceAmount === null || car.priceAmount === undefined || car.priceAmount === "") {
    return "تواصل لمعرفة السعر";
  }
  return `${Number(car.priceAmount).toLocaleString("ar-JO")} دينار`;
}

export function statusText(car) {
  return car.status === "sold" ? "مباع" : "تواصل للتأكد من التوفر";
}

export function carUrl(car) {
  return `${location.origin}/cars/${car.id}`;
}

export function whatsappHref(car) {
  const text = `السلام عليكم، أرغب بالاستفسار عن ${car.title}\n${carUrl(car)}`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function callHref() {
  return `tel:${CALL_NUMBER}`;
}

export async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("تعذر تحميل البيانات");
  return response.json();
}

export async function loadSite() {
  try {
    return await getJson("/api/site");
  } catch {
    return getJson("/data/site.json");
  }
}

export async function loadCars() {
  try {
    return await getJson("/api/cars");
  } catch {
    return getJson("/data/cars.json");
  }
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function carCard(car) {
  const bits = [car.year, car.mileage, car.fuel].filter(Boolean).join(" · ");
  const image = car.images?.[0] || "/media/cover.jpg";
  return el("a", { class: "card car-card", href: `/cars/${car.id}` }, [
    el("img", { src: image, alt: car.title, loading: "lazy", width: "640", height: "420" }),
    el("div", { class: "body" }, [
      el("span", { class: car.status === "sold" ? "badge badge-sold" : "badge badge-check" }, statusText(car)),
      el("h3", {}, car.title),
      bits ? el("div", { class: "meta" }, bits) : null,
      el("div", { class: "price" }, priceText(car)),
      car.offerNote ? el("div", { class: "meta" }, car.offerNote) : null
    ])
  ]);
}

export function fillHeader(site) {
  document.querySelectorAll("[data-brand-name]").forEach((node) => {
    node.textContent = site.name;
  });
  const logo = document.querySelector("[data-logo]");
  if (logo && site.logo) logo.src = site.logo;
}

export function applyFilters(cars, params) {
  const q = (params.get("q") || "").trim().toLowerCase();
  const brand = params.get("brand") || "";
  const year = params.get("year") || "";
  const fuel = params.get("fuel") || "";
  const status = params.get("status") || "";
  return cars.filter((car) => {
    const haystack = [car.title, car.brand, car.model, car.color, car.mileage, ...(car.specs || [])].join(" ").toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (brand && car.brand !== brand) return false;
    if (year && String(car.year || "") !== year) return false;
    if (fuel && car.fuel !== fuel) return false;
    if (status && car.status !== status) return false;
    return true;
  });
}

export function unique(cars, key) {
  return [...new Set(cars.map((car) => car[key]).filter((value) => value !== null && value !== undefined && value !== ""))];
}
