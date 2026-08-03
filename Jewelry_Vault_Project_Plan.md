# Jewelry Vault -- Project Plan

## Vision

A private, family-first digital jewelry vault to securely manage jewelry
inventory, bank locker movements, ownership, documents, and reminders.

### Goals

-   100% free to build and operate
-   Cross-platform (Android + iPhone)
-   Secure and simple
-   No Play Store or App Store required
-   Designed for 5--10 family members

------------------------------------------------------------------------

# Users

## Roles

### Admin

-   Manage family members
-   Add/Edit/Delete jewelry
-   Configure lockers
-   Export backups
-   View audit logs

### Member

-   View assigned jewelry
-   Check items in/out
-   Upload photos
-   View history

------------------------------------------------------------------------

# Core Features

## Dashboard

-   Total items
-   Total gold weight
-   Estimated value
-   Items in locker
-   Items outside locker
-   Overdue returns
-   Upcoming events

## Jewelry Inventory

Each item stores: - Photos - Name - Category - Gross weight - Net gold
weight - Stone weight - Purity - Hallmark number - Purchase date -
Purchase price - Current estimated value - Jeweler - Invoice -
Certificate - Notes

## Locker Management

Support multiple locations: - SBI Locker - ICICI Locker - Home Safe

## Movement Tracking

Every movement is permanent: - Taken out - Returned - Transfer between
lockers - Date/time - User - Reason - Expected return

## Event Management

Examples: - Wedding - Birthday - Festival

Attach jewelry to events.

## Family Members

Track who currently has each item.

## Documents

-   Invoice
-   Hallmark certificate
-   Insurance
-   Warranty

## Search

Search by: - Name - Category - Weight - Purity - Holder - Location -
Hallmark

## QR Codes

Generate and scan QR codes for jewelry boxes or items.

------------------------------------------------------------------------

# Notifications

-   Return reminders
-   Overdue reminders
-   Event reminders
-   Locker visit reminders
-   Missing document reminders

------------------------------------------------------------------------

# Tech Stack

## Frontend

-   Next.js
-   React
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   React Hook Form
-   Zod
-   TanStack Table
-   Recharts

## PWA

-   next-pwa
-   Install from browser on Android/iPhone

## Backend

-   FastAPI
-   Python
-   SQLAlchemy
-   Alembic

## Authentication

-   Firebase Authentication (free) or custom JWT

## Database

-   Firestore (simplest free option)

## File Storage

-   Firebase Storage

## Notifications

-   Firebase Cloud Messaging (Android)
-   Web Push (PWA)

## QR

-   qrcode
-   html5-qrcode

## OCR

-   Tesseract OCR

## PDF

-   ReportLab

## Excel

-   openpyxl

------------------------------------------------------------------------

# Deployment

Frontend: - Firebase Hosting or Cloudflare Pages (Free)

Backend: - Render Free or Koyeb Free (if using FastAPI)

Database: - Firestore Free Tier

Storage: - Firebase Storage Free Tier

Source Control: - GitHub

------------------------------------------------------------------------

# Security

-   HTTPS
-   Role-based access
-   PIN/Biometric (device)
-   Audit log
-   Daily backup export
-   Secure authentication

------------------------------------------------------------------------

# Suggested Screens

1.  Login
2.  Dashboard
3.  Jewelry List
4.  Jewelry Detail
5.  Add/Edit Jewelry
6.  Take Out
7.  Return Item
8.  Movement History
9.  Events
10. Family Members
11. Lockers
12. Notifications
13. Settings

------------------------------------------------------------------------

# Database Collections

-   users
-   jewelry
-   lockers
-   movements
-   events
-   documents
-   notifications

------------------------------------------------------------------------

# Development Roadmap

## Phase 1

-   Authentication
-   Dashboard
-   Jewelry CRUD
-   Photos
-   Search

## Phase 2

-   Lockers
-   Movement tracking
-   Family members
-   Events

## Phase 3

-   QR scanning
-   Notifications
-   OCR
-   PDF export

## Phase 4

-   Polish
-   Offline support
-   Automatic backups

------------------------------------------------------------------------

# Future Ideas

-   Gold price tracking
-   Insurance renewal
-   Jewelry servicing reminders
-   AI search
-   Shared family timeline
-   Multi-family support
-   Desktop app

------------------------------------------------------------------------

# Success Criteria

-   Every family member can install on Android/iPhone.
-   Every jewelry item has photos and history.
-   Know exactly where every item is.
-   Never lose track of items outside the locker.
-   Operate with no recurring software costs.
