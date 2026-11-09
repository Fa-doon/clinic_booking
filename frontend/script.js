
const slotsContainer = document.getElementById("slots-container");
const bookingSection = document.getElementById("booking-section");
const selectedSlotText = document.getElementById("selected-slot");
const message = document.getElementById("message");
const closeBookingButton = document.getElementById("close-booking");
const bookingForm = document.getElementById("booking-form");
const confirmationSection = document.getElementById("confirmation-section");
const confirmationDetails = document.getElementById("confirmation-details");

let selectedSlot = null;
let currentIdempotencyKey = null;
let currentRequestBody = null;

const formatDate = (date) => {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const formatTime = (date) => {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const showMessage = (text, type = "") => {
  message.textContent = text;
  message.className = type;
};

const closeBookingForm = () => {
  document.querySelectorAll(".slot-card").forEach((card) => {
    card.classList.remove("selected");
  });

  selectedSlot = null;
  currentIdempotencyKey = null;
  currentRequestBody = null;

  bookingSection.hidden = true;
  bookingForm.reset();

  showMessage("");
};

const selectSlot = (slot, card) => {
  if (!slot.available) return;

  document.querySelectorAll(".slot-card").forEach((item) => {
    item.classList.remove("selected");
  });

  card.classList.add("selected");

  selectedSlot = slot;
  currentIdempotencyKey = null;
  currentRequestBody = null;

  const start = new Date(slot.start);

  selectedSlotText.textContent =
    `${slot.provider} — ${formatDate(start)} at ${formatTime(start)}`;

  bookingForm.reset();
  bookingSection.hidden = false;
  confirmationSection.hidden = true;

  showMessage("");

  bookingSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
};

const createSlotCard = (slot) => {
  const card = document.createElement("div");
  card.className = "slot-card";
  card.tabIndex = slot.available ? 0 : -1;
  card.setAttribute("role", slot.available ? "button" : "group");

  const start = new Date(slot.start);
  const end = new Date(slot.end);

  const provider = document.createElement("h3");
  provider.textContent = slot.provider;

  const date = document.createElement("p");
  date.textContent = formatDate(start);

  const time = document.createElement("p");
  time.textContent = `${formatTime(start)} – ${formatTime(end)}`;

  const status = document.createElement("span");
  status.className = `slot-status ${
    slot.available ? "available" : "booked"
  }`;

  status.textContent = slot.available ? "Available" : "Booked";

  card.append(provider, date, time, status);

  if (!slot.available) {
    card.classList.add("unavailable");
  } else {
    card.addEventListener("click", () => selectSlot(slot, card));

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectSlot(slot, card);
      }
    });
  }

  return card;
};

const loadSlots = async () => {
  slotsContainer.replaceChildren();

  bookingSection.hidden = true;
  selectedSlot = null;

  showMessage("Loading available slots...");

  try {
    const response = await fetch(`${API_BASE_URL}/slots`, {
      headers: {
        "x-api-key": API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load slots");
    }

    if (data.slots.length === 0) {
      showMessage("No appointment slots are currently available.");
      return;
    }

    const fragment = document.createDocumentFragment();

    data.slots.forEach((slot) => {
      fragment.appendChild(createSlotCard(slot));
    });

    slotsContainer.appendChild(fragment);

    const availableCount = data.slots.filter(
      (slot) => slot.available
    ).length;

    showMessage(
      `${availableCount} appointment slot${availableCount === 1 ? "" : "s"} available.`
    );
  } catch (error) {
    console.error("Error loading slots:", error);
    showMessage(
      error.message || "Unable to load appointment slots.",
      "error"
    );
  }
};

const displayConfirmation = (booking, slot) => {
  confirmationDetails.replaceChildren();

  const start = new Date(slot.start);
  const end = new Date(slot.end);

  const details = [
    ["Booking ID", booking.id],
    ["Name", booking.name],
    ["Email", booking.email],
    ["Provider", slot.provider],
    ["Appointment Date", formatDate(start)],
    ["Appointment Time", `${formatTime(start)} – ${formatTime(end)}`],
    ["Status", booking.status],
  ];

  details.forEach(([label, value]) => {
    const paragraph = document.createElement("p");
    const strong = document.createElement("strong");

    strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(value));

    confirmationDetails.appendChild(paragraph);
  });

  confirmationSection.hidden = false;

  confirmationSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
};

closeBookingButton.addEventListener("click", closeBookingForm);

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedSlot) {
    showMessage("Please select an appointment slot.", "error");
    return;
  }

  const submitButton = bookingForm.querySelector(
    'button[type="submit"]'
  );

  const requestBody = {
    slot_id: selectedSlot.id,
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
  };

  const requestBodyString = JSON.stringify(requestBody);

  // Reuse the same key when retrying an identical request.
  if (currentRequestBody !== requestBodyString) {
    currentIdempotencyKey = crypto.randomUUID();
    currentRequestBody = requestBodyString;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Booking...";

  showMessage("Processing your booking...");

  try {
    const response = await fetch(`${API_BASE_URL}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "Idempotency-Key": currentIdempotencyKey,
      },
      body: requestBodyString,
    });

    const data = await response.json();

    if (!response.ok) {
      let errorMessage = data.error || "Unable to complete your booking.";

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");

        if (retryAfter) {
          errorMessage += ` Please try again in ${retryAfter} seconds.`;
        }
      }

      throw new Error(errorMessage);
    }

    const bookedSlot = selectedSlot;

    bookingSection.hidden = true;
    selectedSlot = null;
    currentIdempotencyKey = null;
    currentRequestBody = null;

    bookingForm.reset();

    displayConfirmation(data, bookedSlot);

    // Refresh the slots to show the newly booked slot as unavailable.
    await loadSlots();
  } catch (error) {
    console.error("Booking error:", error);
    showMessage(error.message || "Something went wrong. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Book Appointment";
  }
});

loadSlots();
