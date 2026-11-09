const API_URL = "http://localhost:3000";
const API_KEY = "HOy3ZF24eji0X14LrFjyZBosiiqXpqrj";

const bookSlot = () => {
  return fetch(`${API_URL}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "Idempotency-Key": "booking-concurrency-002",
    },
    body: JSON.stringify({
      slot_id: "s1",
      name: "John Doe",
      email: "john@example.com",
    }),
  }).then(async (response) => ({
    status: response.status,
    body: await response.json(),
  }));
};

const results = await Promise.all([
  bookSlot(),
  bookSlot(),
]);

console.log(results);