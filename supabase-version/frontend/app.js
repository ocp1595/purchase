const state = {
  user: null,
  purchases: [],
  purchaseDetails: [],
  receipts: [],
  sales: [],
  users: [],
  selectedPurchase: null,
  selectedPurchaseDetail: null,
  selectedReceipt: null,
  selectedSale: null,
  selectedUser: null,
};

const roleLabels = {
  admin: "系統管理者",
  sales: "管銷",
  purchase: "採購",
  warehouse: "儲運",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const appConfig = window.APP_CONFIG || {};
const API_BASE_URL = (appConfig.API_BASE_URL || "").replace(/\/$/, "");
const PUBLISHABLE_KEY = appConfig.SUPABASE_PUBLISHABLE_KEY || "";

function sessionToken() {
  return localStorage.getItem("purchase_erp_token") || "";
}

function setSessionToken(token) {
  if (token) localStorage.setItem("purchase_erp_token", token);
  else localStorage.removeItem("purchase_erp_token");
}

async function api(path, options = {}) {
  const token = sessionToken();
  const headers = {
    "Content-Type": "application/json",
    apikey: PUBLISHABLE_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = await res.json();
  if (!payload.ok) throw new Error(payload.error || "操作失敗");
  return payload.data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function fillForm(form, data = {}) {
  [...form.elements].forEach((el) => {
    if (!el.name) return;
    el.value = data[el.name] ?? "";
  });
}

function showDialog(id) {
  const dialog = $(id);
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(form) {
  const dialog = form.closest("dialog");
  if (dialog?.close) dialog.close();
  else dialog?.removeAttribute("open");
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 2200);
}

function resetLoginForm() {
  const form = $("#loginForm");
  form.reset();
  $("#loginMsg").textContent = "";
  setTimeout(() => form.username.focus(), 0);
}

function can(role) {
  return state.user?.role === "admin" || state.user?.role === role;
}

function numberText(value) {
  return Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 3 });
}

function setTab(tab) {
  $$(".tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  $$(".panel").forEach((panel) => panel.classList.add("hidden"));
  $(`#${tab}Panel`).classList.remove("hidden");
  if (tab === "users") loadUsers();
  if (tab === "purchaseDetails") loadPurchaseDetails();
  if (tab === "receipts") loadReceipts();
  if (tab === "sales") loadSales();
}

function applyRoleUi() {
  $("#userInfo").textContent = `${state.user.employee_name} / ${roleLabels[state.user.role]}`;
  $$(".admin-only").forEach((el) => el.classList.toggle("hidden", state.user.role !== "admin"));
  $("#newPurchaseBtn").disabled = !can("sales");
  $("#editPurchaseBtn").disabled = !can("sales");
  $("#deletePurchaseBtn").disabled = !can("sales");
  $("#newPurchaseDetailBtn").disabled = !can("purchase");
  $("#editPurchaseDetailBtn").disabled = !can("purchase");
  $("#deletePurchaseDetailBtn").disabled = !can("purchase");
  $("#newReceiptBtn").disabled = !can("warehouse");
  $("#editReceiptBtn").disabled = !can("warehouse");
  $("#deleteReceiptBtn").disabled = !can("warehouse");
  $("#newSalesBtn").disabled = !can("sales");
  $("#editSalesBtn").disabled = !can("sales");
  $("#deleteSalesBtn").disabled = !can("sales");
}

function setPurchaseFormAccess() {
  const pf = $("#purchaseForm");
  [...pf.elements].forEach((el) => {
    if (!el.name || el.name === "id") return;
    el.disabled = false;
  });
}

function renderPurchaseRows() {
  const keyword = $("#searchText").value.trim().toLowerCase();
  const rows = state.purchases.filter((row) => !keyword || row.item_spec.toLowerCase().includes(keyword));
  $("#purchaseGrid tbody").innerHTML = rows.map((row) => `
    <tr data-id="${row.id}" class="${state.selectedPurchase?.id === row.id ? "selected" : ""}">
      <td title="${row.item_spec}">${row.item_spec}</td>
      <td>${row.order_date}</td>
      <td>${row.expected_month}</td>
      <td class="num">${numberText(row.requisition_qty)}</td>
      <td class="num">${numberText(row.purchase_qty)}</td>
      <td>${row.unit}</td>
      <td class="num">${numberText(row.receipt_qty)}</td>
      <td class="num">${numberText(row.sold_qty)}</td>
      <td class="num">${numberText(row.balance_qty)}</td>
    </tr>
  `).join("");
}

async function loadPurchases(keepSelection = true) {
  state.purchases = await api("/api/purchases");
  if (keepSelection && state.selectedPurchase) {
    state.selectedPurchase = state.purchases.find((row) => row.id === state.selectedPurchase.id) || null;
  }
  if (!state.selectedPurchase && state.purchases.length) state.selectedPurchase = state.purchases[0];
  renderPurchaseRows();
  selectPurchase(state.selectedPurchase, false);
}

function selectPurchase(row, rerender = true) {
  state.selectedPurchase = row || null;
  state.selectedPurchaseDetail = null;
  state.selectedReceipt = null;
  state.selectedSale = null;
  $("#purchaseDetailHeader").textContent = row ? `- ${row.item_spec}` : "";
  $("#receiptHeader").textContent = row ? `- ${row.item_spec}` : "";
  $("#salesHeader").textContent = row ? `- ${row.item_spec}` : "";
  if (rerender) renderPurchaseRows();
  loadPurchaseDetails();
  loadReceipts();
  loadSales();
}

function openNewPurchase() {
  if (!can("sales")) return toast("只有管銷可新增請購主檔");
  fillForm($("#purchaseForm"), {
    order_date: "",
    expected_month: "",
    requisition_qty: 0,
    unit: "KG",
  });
  setPurchaseFormAccess();
  showDialog("#purchaseDialog");
}

async function openEditPurchase() {
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  if (!can("sales")) return toast("只有管銷可修改請購主檔");
  await loadPurchases(true);
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  fillForm($("#purchaseForm"), {
    id: state.selectedPurchase.id,
    item_spec: state.selectedPurchase.item_spec,
    order_date: state.selectedPurchase.order_date,
    expected_month: state.selectedPurchase.expected_month,
    requisition_qty: state.selectedPurchase.requisition_qty,
    unit: state.selectedPurchase.unit,
  });
  setPurchaseFormAccess();
  showDialog("#purchaseDialog");
}

async function savePurchase(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  if (data.id) {
    await api(`/api/purchases/${data.id}`, { method: "PUT", body: JSON.stringify(data) });
  } else {
    await api("/api/purchases", { method: "POST", body: JSON.stringify(data) });
  }
  closeDialog(form);
  toast("請購主檔已儲存");
  await loadPurchases(false);
}

async function deletePurchase() {
  if (!state.selectedPurchase || !confirm("確定刪除請購主檔？有採購、入庫或接單明細時必須先刪除明細。")) return;
  await api(`/api/purchases/${state.selectedPurchase.id}`, { method: "DELETE", body: JSON.stringify({}) });
  state.selectedPurchase = null;
  toast("請購主檔已刪除");
  await loadPurchases(false);
}

function renderPurchaseDetails() {
  $("#purchaseDetailGrid tbody").innerHTML = state.purchaseDetails.map((row) => `
    <tr data-id="${row.id}" class="${state.selectedPurchaseDetail?.id === row.id ? "selected" : ""}">
      <td>${row.purchase_date}</td>
      <td class="num">${numberText(row.purchase_qty)}</td>
      <td>${row.vendor}</td>
      <td>${row.updated_at}</td>
    </tr>
  `).join("");
}

async function loadPurchaseDetails() {
  if (!state.selectedPurchase) {
    state.purchaseDetails = [];
    $("#purchaseDetailGrid tbody").innerHTML = "";
    return;
  }
  state.purchaseDetails = await api(`/api/purchase-details?purchase_id=${state.selectedPurchase.id}`);
  if (state.selectedPurchaseDetail) {
    state.selectedPurchaseDetail = state.purchaseDetails.find((row) => row.id === state.selectedPurchaseDetail.id) || null;
  }
  renderPurchaseDetails();
}

function openNewPurchaseDetail() {
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  if (!can("purchase")) return toast("只有採購可新增採購明細");
  fillForm($("#purchaseDetailForm"), { purchase_date: "", purchase_qty: 0, vendor: "" });
  showDialog("#purchaseDetailDialog");
}

function openEditPurchaseDetail() {
  if (!state.selectedPurchaseDetail) return toast("請先選擇採購明細");
  if (!can("purchase")) return toast("只有採購可修改採購明細");
  fillForm($("#purchaseDetailForm"), state.selectedPurchaseDetail);
  showDialog("#purchaseDetailDialog");
}

async function savePurchaseDetail(event) {
  event.preventDefault();
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  const form = event.currentTarget;
  const data = { ...formData(form), purchase_id: state.selectedPurchase.id };
  if (data.id) {
    await api(`/api/purchase-details/${data.id}`, { method: "PUT", body: JSON.stringify(data) });
  } else {
    await api("/api/purchase-details", { method: "POST", body: JSON.stringify(data) });
  }
  closeDialog(form);
  toast("採購明細已儲存");
  await loadPurchases(true);
}

async function deletePurchaseDetail() {
  if (!state.selectedPurchaseDetail || !confirm("確定刪除採購明細？")) return;
  await api(`/api/purchase-details/${state.selectedPurchaseDetail.id}`, { method: "DELETE", body: JSON.stringify({}) });
  state.selectedPurchaseDetail = null;
  toast("採購明細已刪除");
  await loadPurchases(true);
}

function renderDetails(kind, rows) {
  const grid = kind === "receipt" ? $("#receiptGrid") : $("#salesGrid");
  const selected = kind === "receipt" ? state.selectedReceipt : state.selectedSale;
  const dateKey = kind === "receipt" ? "receipt_date" : "sales_date";
  const qtyKey = kind === "receipt" ? "receipt_qty" : "sold_qty";
  grid.querySelector("tbody").innerHTML = rows.map((row) => `
    <tr data-id="${row.id}" class="${selected?.id === row.id ? "selected" : ""}">
      <td>${row[dateKey]}</td><td class="num">${numberText(row[qtyKey])}</td><td>${row.updated_at}</td>
    </tr>
  `).join("");
}

async function loadReceipts() {
  if (!state.selectedPurchase) {
    state.receipts = [];
    $("#receiptGrid tbody").innerHTML = "";
    return;
  }
  state.receipts = await api(`/api/receipts?purchase_id=${state.selectedPurchase.id}`);
  renderDetails("receipt", state.receipts);
}

async function loadSales() {
  if (!state.selectedPurchase) {
    state.sales = [];
    $("#salesGrid tbody").innerHTML = "";
    return;
  }
  state.sales = await api(`/api/sales?purchase_id=${state.selectedPurchase.id}`);
  renderDetails("sales", state.sales);
}

function openNewReceipt() {
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  if (!can("warehouse")) return toast("沒有新增入庫明細權限");
  if (Number(state.selectedPurchase.purchase_qty || 0) <= 0) return toast("採購數量必須大於 0，才可以輸入入庫明細");
  fillForm($("#receiptForm"), { receipt_date: "", receipt_qty: 0 });
  showDialog("#receiptDialog");
}

function openEditReceipt() {
  if (!state.selectedReceipt) return toast("請先選擇入庫明細");
  fillForm($("#receiptForm"), state.selectedReceipt);
  showDialog("#receiptDialog");
}

function openNewSales() {
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  if (!can("sales")) return toast("沒有新增接單明細權限");
  if (Number(state.selectedPurchase.receipt_qty || 0) <= 0) return toast("入庫數量必須大於 0，才可以輸入接單明細");
  fillForm($("#salesForm"), { sales_date: "", sold_qty: 0 });
  showDialog("#salesDialog");
}

function openEditSales() {
  if (!state.selectedSale) return toast("請先選擇接單明細");
  fillForm($("#salesForm"), state.selectedSale);
  showDialog("#salesDialog");
}

async function saveReceipt(event) {
  event.preventDefault();
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  const form = event.currentTarget;
  const data = { ...formData(form), purchase_id: state.selectedPurchase.id };
  if (data.id) {
    await api(`/api/receipts/${data.id}`, { method: "PUT", body: JSON.stringify(data) });
  } else {
    await api("/api/receipts", { method: "POST", body: JSON.stringify(data) });
  }
  closeDialog(form);
  toast("入庫明細已儲存");
  await loadPurchases(true);
}

async function saveSales(event) {
  event.preventDefault();
  if (!state.selectedPurchase) return toast("請先選擇請購主檔");
  const form = event.currentTarget;
  const data = { ...formData(form), purchase_id: state.selectedPurchase.id };
  if (data.id) {
    await api(`/api/sales/${data.id}`, { method: "PUT", body: JSON.stringify(data) });
  } else {
    await api("/api/sales", { method: "POST", body: JSON.stringify(data) });
  }
  closeDialog(form);
  toast("接單明細已儲存");
  await loadPurchases(true);
}

async function deleteReceipt() {
  if (!state.selectedReceipt || !confirm("確定刪除入庫明細？")) return;
  await api(`/api/receipts/${state.selectedReceipt.id}`, { method: "DELETE", body: JSON.stringify({}) });
  state.selectedReceipt = null;
  toast("入庫明細已刪除");
  await loadPurchases(true);
}

async function deleteSales() {
  if (!state.selectedSale || !confirm("確定刪除接單明細？")) return;
  await api(`/api/sales/${state.selectedSale.id}`, { method: "DELETE", body: JSON.stringify({}) });
  state.selectedSale = null;
  toast("接單明細已刪除");
  await loadPurchases(true);
}

function renderUsers() {
  $("#userGrid tbody").innerHTML = state.users.map((row) => `
    <tr data-username="${row.username}" class="${state.selectedUser?.username === row.username ? "selected" : ""}">
      <td>${row.username}</td><td>${row.employee_name}</td><td>${roleLabels[row.role]}</td><td>${row.updated_at}</td>
    </tr>
  `).join("");
}

async function loadUsers() {
  if (state.user.role !== "admin") return;
  state.users = await api("/api/users");
  if (state.selectedUser) {
    state.selectedUser = state.users.find((row) => row.username === state.selectedUser.username) || null;
  }
  renderUsers();
}

function openNewUser() {
  fillForm($("#userForm"), { role: "purchase" });
  $("#userForm").username.disabled = false;
  showDialog("#userDialog");
}

function openEditUser() {
  if (!state.selectedUser) return toast("請先選擇員工帳號");
  fillForm($("#userForm"), { ...state.selectedUser, password: "" });
  $("#userForm").username.disabled = true;
  showDialog("#userDialog");
}

async function saveUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  if (form.username.disabled && state.selectedUser) data.username = state.selectedUser.username;
  const existing = state.users.some((row) => row.username === data.username);
  await api("/api/users", { method: existing ? "PUT" : "POST", body: JSON.stringify(data) });
  closeDialog(form);
  toast("員工帳密已儲存");
  await loadUsers();
}

async function deleteUser() {
  if (!state.selectedUser || !confirm(`確定刪除帳號 ${state.selectedUser.username}？`)) return;
  await api("/api/users", { method: "DELETE", body: JSON.stringify({ username: state.selectedUser.username }) });
  state.selectedUser = null;
  toast("員工帳密已刪除");
  await loadUsers();
}

async function boot() {
  try {
    state.user = await api("/api/me");
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    applyRoleUi();
    await loadPurchases();
  } catch {
    setSessionToken("");
    $("#loginView").classList.remove("hidden");
    $("#appView").classList.add("hidden");
    resetLoginForm();
  }
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#loginMsg").textContent = "";
    try {
      const user = await api("/api/login", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
      setSessionToken(user.token);
      delete user.token;
      state.user = user;
      $("#loginView").classList.add("hidden");
      $("#appView").classList.remove("hidden");
      applyRoleUi();
      await loadPurchases();
    } catch (err) {
      $("#loginMsg").textContent = err.message;
    }
  });
  $("#loginForm").username.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#loginForm").password.focus();
    }
  });
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: JSON.stringify({}) });
    setSessionToken("");
    state.user = null;
    $("#appView").classList.add("hidden");
    $("#loginView").classList.remove("hidden");
    resetLoginForm();
  });
  $$(".tab").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
  $("#reloadBtn").addEventListener("click", () => loadPurchases(true));
  $("#searchText").addEventListener("input", renderPurchaseRows);
  $("#newPurchaseBtn").addEventListener("click", openNewPurchase);
  $("#editPurchaseBtn").addEventListener("click", openEditPurchase);
  $("#deletePurchaseBtn").addEventListener("click", deletePurchase);
  $("#purchaseForm").addEventListener("submit", savePurchase);
  $("#newPurchaseDetailBtn").addEventListener("click", openNewPurchaseDetail);
  $("#editPurchaseDetailBtn").addEventListener("click", openEditPurchaseDetail);
  $("#deletePurchaseDetailBtn").addEventListener("click", deletePurchaseDetail);
  $("#purchaseDetailForm").addEventListener("submit", savePurchaseDetail);
  $("#newReceiptBtn").addEventListener("click", openNewReceipt);
  $("#editReceiptBtn").addEventListener("click", openEditReceipt);
  $("#deleteReceiptBtn").addEventListener("click", deleteReceipt);
  $("#receiptForm").addEventListener("submit", saveReceipt);
  $("#newSalesBtn").addEventListener("click", openNewSales);
  $("#editSalesBtn").addEventListener("click", openEditSales);
  $("#deleteSalesBtn").addEventListener("click", deleteSales);
  $("#salesForm").addEventListener("submit", saveSales);
  $("#newUserBtn").addEventListener("click", openNewUser);
  $("#editUserBtn").addEventListener("click", openEditUser);
  $("#deleteUserBtn").addEventListener("click", deleteUser);
  $("#userForm").addEventListener("submit", saveUser);
  $$(".close-dialog").forEach((btn) => btn.addEventListener("click", () => closeDialog(btn.closest("form"))));

  document.body.addEventListener("click", (event) => {
    const tr = event.target.closest("tr");
    if (!tr) return;
    if (tr.closest("#purchaseGrid")) {
      const id = Number(tr.dataset.id);
      selectPurchase(state.purchases.find((row) => row.id === id));
    }
    if (tr.closest("#purchaseDetailGrid")) {
      state.selectedPurchaseDetail = state.purchaseDetails.find((row) => row.id === Number(tr.dataset.id)) || null;
      renderPurchaseDetails();
    }
    if (tr.closest("#receiptGrid")) {
      state.selectedReceipt = state.receipts.find((row) => row.id === Number(tr.dataset.id)) || null;
      renderDetails("receipt", state.receipts);
    }
    if (tr.closest("#salesGrid")) {
      state.selectedSale = state.sales.find((row) => row.id === Number(tr.dataset.id)) || null;
      renderDetails("sales", state.sales);
    }
    if (tr.closest("#userGrid")) {
      state.selectedUser = state.users.find((row) => row.username === tr.dataset.username) || null;
      renderUsers();
    }
  });
}

bindEvents();
boot();
