const login = document.getElementById("login");
const app = document.getElementById("app");
const list = document.getElementById("car-list");
const editor = document.getElementById("editor");
const currentImages = document.getElementById("current-images");
const saved = document.getElementById("saved");
const formError = document.getElementById("form-error");
const removeButton = document.getElementById("remove");
let cars = [];
let editingId = null;

function showError(node, message) {
  node.hidden = !message;
  node.textContent = message || "";
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذر تنفيذ الطلب");
  return data;
}

function blank() {
  editingId = null;
  editor.reset();
  currentImages.replaceChildren();
  removeButton.hidden = true;
  document.getElementById("editor-title").textContent = "سيارة جديدة";
  saved.hidden = true;
  highlight();
}

function fill(car) {
  editingId = car.id;
  editor.title.value = car.title || "";
  editor.brand.value = car.brand || "";
  editor.model.value = car.model || "";
  editor.year.value = car.year ?? "";
  editor.priceAmount.value = car.priceAmount ?? "";
  editor.mileage.value = car.mileage || "";
  editor.color.value = car.color || "";
  editor.fuel.value = car.fuel || "";
  editor.status.value = car.status || "check";
  editor.offerNote.value = car.offerNote || "";
  editor.source.value = car.source || "";
  editor.specs.value = (car.specs || []).join("\n");
  editor.images.value = "";
  currentImages.replaceChildren();
  (car.images || []).forEach((src) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = src;
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.width = 92;
    img.height = 70;
    label.append(img, document.createElement("br"), box, " حذف");
    currentImages.append(label);
  });
  removeButton.hidden = false;
  document.getElementById("editor-title").textContent = "تعديل السيارة";
  saved.hidden = true;
  highlight();
}

function highlight() {
  list.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.id === editingId);
  });
}

function renderList() {
  list.replaceChildren();
  cars.forEach((car) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = car.id;
    button.textContent = `${car.title}${car.status === "sold" ? " · مباع" : ""}`;
    button.addEventListener("click", () => fill(car));
    list.append(button);
  });
  highlight();
}

async function loadCars() {
  cars = await api("/api/cars");
  renderList();
}

login.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(document.getElementById("login-error"), "");
  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: login.username.value,
        password: login.password.value
      })
    });
    login.hidden = true;
    app.hidden = false;
    document.getElementById("logout").hidden = false;
    await loadCars();
    blank();
  } catch (error) {
    showError(document.getElementById("login-error"), error.message);
  }
});

document.getElementById("logout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  location.reload();
});

document.getElementById("create").addEventListener("click", blank);

editor.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  saved.hidden = true;
  const payload = {
    title: editor.title.value,
    brand: editor.brand.value,
    model: editor.model.value,
    year: editor.year.value,
    priceAmount: editor.priceAmount.value,
    mileage: editor.mileage.value,
    color: editor.color.value,
    fuel: editor.fuel.value,
    status: editor.status.value,
    offerNote: editor.offerNote.value,
    source: editor.source.value,
    specs: editor.specs.value,
    removeImages: [...currentImages.querySelectorAll("input:checked")].map((box) => box.value)
  };
  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  for (const file of editor.images.files) body.append("images", file);
  try {
    const url = editingId ? `/api/admin/cars/${editingId}` : "/api/admin/cars";
    const car = await api(url, { method: editingId ? "PUT" : "POST", body });
    await loadCars();
    fill(cars.find((item) => item.id === car.id) || car);
    saved.hidden = false;
  } catch (error) {
    showError(formError, error.message);
  }
});

removeButton.addEventListener("click", async () => {
  if (!editingId || !confirm("حذف هذه السيارة وصورها من الجهاز؟")) return;
  await api(`/api/admin/cars/${editingId}`, { method: "DELETE" });
  await loadCars();
  blank();
});

try {
  const me = await api("/api/admin/me");
  if (me.admin) {
    login.hidden = true;
    app.hidden = false;
    document.getElementById("logout").hidden = false;
    await loadCars();
    blank();
  }
} catch {
  login.hidden = true;
  app.hidden = true;
  document.getElementById("static-note").hidden = false;
  document.getElementById("logout").hidden = true;
}
