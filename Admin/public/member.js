async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({ error: "Unexpected server response." }));
  if (!response.ok) throw Error(data.error || "Request failed.");
  return data;
}

const $ = id => document.getElementById(id);
const safe = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

function pill(status) {
  const value = String(status || "pending").toLowerCase();
  return `<span class="status-pill ${safe(value)}">${safe(status || "pending")}</span>`;
}

function displayDate(value) {
  if (!value) return "Not provided";
  const dateText = String(value).slice(0, 10);
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateText
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatProgressDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function showProfile(user) {
  $("memberName").textContent = user.name || "member";
  $("memberEmail").textContent = user.email || "Member account";
  $("memberDob").textContent = displayDate(user.date_of_birth);
}

async function loadProgress() {
  const { entries = [] } = await api("/api/member/progress");
  $("progressEntries").innerHTML = entries.length
    ? entries.map(entry => `
      <article class="card progress-card">
        <img src="${safe(entry.image_data)}" alt="Progress photo from ${safe(formatProgressDate(entry.created_at))}">
        <button class="progress-remove" type="button" data-progress-delete="${safe(entry.id)}" aria-label="Remove progress photo from ${safe(formatProgressDate(entry.created_at))}" title="Remove photo">×</button>
        <div class="progress-card-content">
          <strong>${safe(formatProgressDate(entry.created_at))}</strong>
          ${entry.note ? `<p>${safe(entry.note)}</p>` : ""}
        </div>
      </article>
    `).join("")
    : '<p class="progress-empty muted">Your first check-in is ready when you are. Add a photo to start your private progress journal.</p>';

  const lastEntry = entries[0];
  const lastDate = lastEntry ? new Date(lastEntry.created_at) : null;
  if (!lastDate || Number.isNaN(lastDate.getTime())) {
    $("progressReminder").textContent = "Your first weekly progress check-in is ready.";
    return;
  }

  const dueDate = new Date(lastDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  $("progressReminder").textContent = daysUntilDue <= 0
    ? `Your weekly check-in is due. Last update: ${formatProgressDate(lastEntry.created_at)}.`
    : `Next weekly check-in in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}. Last update: ${formatProgressDate(lastEntry.created_at)}.`;
}

function showSectionError(element, error, fallback) {
  element.textContent = `${fallback} ${error.message}`;
}

async function loadPayments() {
  const { payments = [] } = await api("/api/member/payments");
  $("memberPayments").innerHTML = payments.length
    ? payments.map(payment => `
      <tr>
        <td>${safe((payment.created_at || "").slice(0, 10))}</td>
        <td>${safe(payment.transaction_ref)}</td>
        <td>₹${(Number(payment.amount_paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        <td>${safe(({ cash: "Cash", card: "Card", gpay: "GPay", bank_transfer: "Bank transfer" })[payment.method] || payment.method)}</td>
        <td>${pill(payment.status)}</td>
        <td style="white-space:normal">${safe(payment.notes)}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="6">No payment records have been added yet.</td></tr>';
}

async function loadMessages() {
  const { messages = [] } = await api("/api/member/messages");
  $("memberMessages").innerHTML = messages.length
    ? messages.map(message => `
      <article class="inbox-item">
        <div class="small">${safe(new Date(message.sent_at || message.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}</div>
        <h3>${safe(message.subject || "Message from Sibi Sports Club")}</h3>
        <p>${safe(message.body)}</p>
        ${message.image_data ? `<img class="inbox-image" src="${safe(message.image_data)}" alt="Message image">` : ""}
      </article>
    `).join("")
    : '<p class="muted">You have no new messages.</p>';
}

async function load() {
  try {
    const data = await api("/api/member/dashboard");
    const user = data.user;
    $("memberNotice").classList.add("hidden");
    $("memberPanel").classList.remove("hidden");
    $("memberId").textContent = user.member_id || "—";
    showProfile(user);
    $("memberPlan").textContent = user.plan === "Custom"
      ? `${user.custom_plan_details || "Custom plan"} · ₹${(Number(user.custom_plan_amount_paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : user.plan || "—";
    $("memberStatus").textContent = `Account: ${user.status || "pending"}`;
    $("memberDue").textContent = displayDate(user.membership_due_date);
    $("memberPaymentStatus").textContent = `Latest payment: ${data.paymentStatus || "pending"}`;

    if (user.plan === "Custom" && ![...$("plan").options].some(option => option.value === "Custom")) {
      $("plan").add(new Option(
        `${user.custom_plan_details || "Custom plan"} — ₹${(Number(user.custom_plan_amount_paise || 0) / 100).toLocaleString("en-IN")}`,
        "Custom",
      ));
    }
    $("plan").value = user.plan;
    $("profileName").value = user.name || "";
    $("profileEmail").value = user.email || "";
    $("profilePhone").value = user.phone || "";
    $("profileAddress").value = user.address || "";
    $("profileDateOfBirth").value = String(user.date_of_birth || "").slice(0, 10);
    $("profileAge").value = user.age ?? "";
    $("profileGender").value = user.gender || "";
    $("profileGoal").value = user.fitness_goal || "";
    $("profileEmergencyContact").value = user.emergency_contact || "";
    $("profileDateOfBirth").max = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const results = await Promise.allSettled([loadPayments(), loadMessages(), loadProgress()]);
    if (results[0].status === "rejected") {
      $("memberPayments").innerHTML = `<tr><td colspan="6">${safe(results[0].reason.message)}</td></tr>`;
    }
    if (results[1].status === "rejected") {
      showSectionError($("memberMessages"), results[1].reason, "Messages could not be loaded.");
    }
    if (results[2].status === "rejected") {
      showSectionError($("progressEntries"), results[2].reason, "Progress photos could not be loaded.");
    }
  } catch (error) {
    $("memberNotice").textContent = `${error.message} Redirecting to sign in…`;
    setTimeout(() => { location.href = "/login.html"; }, 1100);
  }
}

document.querySelector("#plan optgroup[label='Existing legacy plans']")?.remove();

$("planForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  $("planMessage").textContent = "Saving your package selection…";
  try {
    const data = await api("/api/member/plan", {
      method: "PATCH",
      body: JSON.stringify({ plan: $("plan").value }),
    });
    $("planMessage").textContent = data.message || "Package selection saved.";
    $("memberPlan").textContent = data.user.plan;
  } catch (error) {
    $("planMessage").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  $("profileMessage").textContent = "Saving your profile…";
  try {
    const data = await api("/api/member/profile", {
      method: "PATCH",
      body: JSON.stringify({
        name: $("profileName").value.trim(),
        email: $("profileEmail").value.trim(),
        phone: $("profilePhone").value.trim(),
        address: $("profileAddress").value.trim(),
        date_of_birth: $("profileDateOfBirth").value,
        age: $("profileAge").value,
        gender: $("profileGender").value,
        fitness_goal: $("profileGoal").value.trim(),
        emergency_contact: $("profileEmergencyContact").value.trim(),
      }),
    });
    showProfile(data.user);
    $("profileMessage").textContent = "Your profile details have been updated.";
  } catch (error) {
    $("profileMessage").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("passwordForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const message = $("passwordMessage");
  if ($("newPassword").value !== $("confirmPassword").value) {
    message.textContent = "The new passwords do not match.";
    $("confirmPassword").focus();
    return;
  }
  button.disabled = true;
  message.textContent = "Updating your password…";
  try {
    const data = await api("/api/member/password", {
      method: "PATCH",
      body: JSON.stringify({
        current_password: $("currentPassword").value,
        new_password: $("newPassword").value,
      }),
    });
    form.reset();
    message.textContent = data.message;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

function clearProgressPreview() {
  if ($("progressPreviewImage").src.startsWith("blob:")) {
    URL.revokeObjectURL($("progressPreviewImage").src);
  }
  $("progressPreviewImage").removeAttribute("src");
  $("progressPreview").classList.add("hidden");
}

$("progressPhoto").addEventListener("change", () => {
  const input = $("progressPhoto");
  const file = input.files[0];
  $("progressMessage").textContent = "";
  clearProgressPreview();
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    input.value = "";
    $("progressMessage").textContent = "Choose a PNG, JPG or WebP photo.";
    return;
  }
  if (file.size > 1_500_000) {
    input.value = "";
    $("progressMessage").textContent = "Choose a photo smaller than 1.5 MB.";
    return;
  }
  $("progressPreviewImage").src = URL.createObjectURL(file);
  $("progressPreview").classList.remove("hidden");
});

function readProgressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("Could not read the selected photo."));
    reader.readAsDataURL(file);
  });
}

$("progressForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = $("progressPhoto").files[0];
  const button = form.querySelector("button[type='submit']");
  const message = $("progressMessage");
  if (!file) {
    message.textContent = "Choose a progress photo first.";
    return;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    message.textContent = "Choose a PNG, JPG or WebP photo.";
    return;
  }
  if (file.size > 1_500_000) {
    message.textContent = "Choose a photo smaller than 1.5 MB.";
    return;
  }

  button.disabled = true;
  message.textContent = "Saving your private progress photo…";
  try {
    await api("/api/member/progress", {
      method: "POST",
      body: JSON.stringify({
        image_data: await readProgressPhoto(file),
        note: $("progressNote").value.trim(),
      }),
    });
    form.reset();
    clearProgressPreview();
    message.textContent = "Your progress photo has been saved.";
    await loadProgress();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("progressEntries").addEventListener("click", async event => {
  const button = event.target.closest("[data-progress-delete]");
  if (!button || !window.confirm("Remove this progress photo? This cannot be undone.")) return;
  button.disabled = true;
  $("progressMessage").textContent = "Removing progress photo…";
  try {
    await api(`/api/member/progress/${encodeURIComponent(button.dataset.progressDelete)}`, { method: "DELETE" });
    await loadProgress();
    $("progressMessage").textContent = "Progress photo removed.";
  } catch (error) {
    $("progressMessage").textContent = error.message;
    button.disabled = false;
  }
});

$("refreshProgress").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await loadProgress();
  } catch (error) {
    showSectionError($("progressEntries"), error, "Progress photos could not be loaded.");
  } finally {
    button.disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  const button = $("logout");
  button.disabled = true;
  try {
    await api("/api/auth/logout", { method: "POST" });
    location.href = "/";
  } catch (error) {
    $("memberNotice").classList.remove("hidden");
    $("memberNotice").textContent = error.message;
    button.disabled = false;
  }
});

load();
