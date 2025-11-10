# Permanent PDFs Storage

This directory contains **permanently saved voter slip PDFs**.

## How It Works

When a user downloads their voter slips for the first time:
1. PDF is generated from database (takes 20-50 seconds)
2. PDF is **saved permanently** to this directory
3. Filename: `{orderId}.pdf` (e.g., `ORD-20251109-VE4JG4.pdf`)

For subsequent downloads:
1. System checks if PDF exists here
2. Serves cached file instantly (~2-3 seconds)
3. **No re-generation needed!**

## Benefits

✅ **Instant downloads** after first generation
✅ **No re-computation** - saves server resources
✅ **Reliable** - PDF always available for paid orders
✅ **No expiration** - PDFs stay forever

## Storage Considerations

- **File size:** ~2-5 MB per order (varies by voter count)
- **Growth rate:** Depends on number of orders
- **Cleanup:** Manual only (these are permanent)

## When to Clean

Only delete PDFs if:
- Order was refunded
- Data needs to be updated (rare)
- Storage space is critical

## File Naming

Format: `{orderId}.pdf`

Examples:
- `ORD-20251109-VE4JG4.pdf`
- `ORD-20251110-ABC123.pdf`

## Security Note

These files are stored in `public/` directory but:
- Not accessible via direct URL (not in static routes)
- Only served through authenticated API: `/api/slips/download/:orderId`
- Download requires:
  - Valid JWT token
  - Order ownership (userId match)
  - Payment completed

---

**This directory should be included in backups!**
