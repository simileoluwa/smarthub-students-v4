# SOP-005: WhatsApp Integration & Notification Engine

## 1. Objective
Define integration protocols for student-to-student sharing via WhatsApp and the rules for Web Push notification dispatch. The system must coordinate peer sharing in a bandwidth-efficient, native manner without relying on expensive backend servers.

## 2. Scope
This protocol governs formatting in `/tools/whatsapp.ts`, Deep Link handling in `/frontend/pages/deck/[id].tsx`, and push registrations using Firebase Cloud Messaging (FCM) or standard Service Worker Web Push in `/workers/notification.ts`.

---

## 3. WhatsApp Integration Blueprint

WhatsApp is the structural communications spine of Nigerian universities. Smart Student Hub prioritizes direct, native WhatsApp share hooks over proprietary social features.

### A. Share Payload Generation Protocol
We format text-based digests containing emojis, visual spacers, and compressed link paths.

#### Mandatory Structural Format:
1.  **Header:** Clean title emoji + capitalized context label.
2.  **Divider Line:** Single continuous Unicode horizontal divider bar.
3.  **Core Metrics:** Course, cards count, or GPA summaries using clear, visual key-value lines.
4.  **Deep Link:** The unique URL pointing to the PWA deck.
5.  **Footer Quotes:** An academic encouragement quote.

#### Formatting Example (Copy-Paste / Native Share Template):
```text
📚 *SMARTHUB STUDY BRIEF*
──────────────────────────
🎓 Course: PHY111 (General Physics I)
🔥 Deck Items: 18 Active Cards
📅 Scheduled Session: Today, 5:00 PM
🚀 Shared by: Tunde

Join this group study or import this card deck directly into your Smart Student Hub workspace:
👉 https://smarthub.student/deck/PHY111-e4b2d
──────────────────────────
💡 _"Hard work beats talent when talent fails to work hard."_
```

### B. Deep Link Encoding & Rehydration
*   **Encoding Method:** When sharing a card deck, the PWA packages the deck arrays into a minified, lightweight JSON object.
*   **Rehydration Method:** When another user clicks the `wa.me` deep link, the receiving device opens the link in their PWA client. The client parses the short-hashed payload, retrieves the card lists, writes them to their local Dexie DB, and automatically adds the course card to their workspace dashboard.
*   **Bandwidth Constraint:** The payload transfer size must remain below **30KB** to avoid expensive data depletion.

---

## 4. Web Push Notification Architecture

We utilize Firebase Web Push or standard Web Push payloads to dispatch reminders. Reminders must be strictly actionable and academically relevant.

### Reminders Schedule & Triggers:
1.  **Spaced Repetition Review Due:** Dispatched when flashcards reach their calculated `next_review_due` time.
2.  **Compressed Semester Milestones:** Sent when calendar ratios shift or an exam approaches.
3.  **Strike Mode Updates:** Centralized push notifying students of academic developments or ASUU negotiations.

---

## 5. Emotional Safety & Hardware Constraints (Strict Rules)

To respect students' devices, connectivity budgets, and mental wellbeing, the notification engine must strictly obey the following rules:

### A. Zero Guilt-Tripping Policy
*   *Forbidden Content:* "You haven't studied today! Your grades will drop!" or "You're breaking your 5-day streak!"
*   *Allowed Content:* "PHY111: 12 cards are ready for a quick recall session when you have a free moment." or "Semester timeline updated: We adjusted your targets to fit the new calendar."

### B. Battery and Power Considerations
*   If the browser indicates low battery capacity (`navigator.getBattery` level < 0.15) and the device is not charging:
    *   Postpone background database synchronizations.
    *   Temporarily mute push indicators to prevent power draining.

### C. Bandwidth Restraints
*   Do not send heavy rich-media push payloads (no images, no audio tracks). Keep notification packets as dry, raw text data (<2KB).
