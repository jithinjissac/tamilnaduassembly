# Quick Reference: Bulk Delete Orders

## 🚀 Quick Start

### Delete 1 Order
1. Click **trash icon** in Actions column
2. Confirm deletion
3. ✅ Done!

### Delete Multiple Orders (Fast)
1. Check **boxes** next to orders ☐ ☐ ☐
2. Click **Delete Selected (3)** (red button)
3. Confirm deletion
4. ✅ Done!

### Select All Orders
1. Click **"Select All"** button
2. All orders get checked
3. Bulk actions bar shows count
4. Click **Delete Selected (N)**
5. ✅ Done!

---

## 🎯 Features

| Feature | How to Use | Result |
|---------|-----------|--------|
| **Select One** | Click checkbox | Adds/removes order from selection |
| **Select All** | Click "Select All" button | Checks all visible orders |
| **Deselect All** | Click "Deselect All" button | Unchecks all orders |
| **Delete Single** | Click trash icon in Actions | Delete one order immediately |
| **Delete Multiple** | Select + click "Delete Selected" | Delete all selected orders at once |
| **See Count** | Check blue bar | Shows "X orders selected" |

---

## ⚠️ Important Notes

- ❌ **Cannot be undone** - Deletion is permanent
- ✅ **Requires confirmation** - Double-check before confirming
- 🔒 **Admin only** - Only admins can delete
- 📊 **Works with filters** - Delete based on search/filter results
- ⚡ **Bulk is fast** - Delete 100+ orders at once

---

## 🔑 Keyboard Shortcuts

| Action | How |
|--------|-----|
| Select/Deselect | Click checkbox |
| Toggle all | Click header checkbox |
| Delete selected | Click red button OR press Enter (if focused) |

---

## 📱 Mobile View

Bulk delete works on mobile too!
- Scroll right to see full table
- Tap checkboxes to select
- Bulk actions bar appears at top
- Tap "Delete Selected" button

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| Checkboxes not showing | Hard refresh page (Ctrl+Shift+R) |
| Delete button disabled | Select at least 1 order first |
| Error after delete | Refresh page or try again |
| Order still there | Hard refresh (Ctrl+Shift+R) |

---

## 📊 Before & After

**Before this feature:**
- ❌ Could only view orders
- ❌ Had to manually remove from database
- ❌ No bulk operations

**After this feature:**
- ✅ Delete from UI directly
- ✅ Select and delete multiple at once
- ✅ Instant confirmation & feedback

---

## 💡 Pro Tips

1. **Filter first** - Use search/filter, then select all relevant orders
2. **Backup data** - Export important orders before deleting
3. **Delete in batches** - Delete 10-20 at a time for easier confirmation
4. **Check status** - Filter by "Pending" to delete unpaid orders

---

## 🚀 How It Works (Technical)

```
Frontend (Admin clicks delete)
    ↓
Check if admin & authenticated
    ↓
Validate order IDs
    ↓
Send DELETE request
    ↓
Backend removes from database
    ↓
Confirm deletion & refresh UI
    ↓
✅ Orders gone!
```

---

## 📞 Need Help?

- Check the full guide: `BULK_DELETE_ORDERS_GUIDE.md`
- Review API endpoints: See section "📈 API Endpoints"
- Test locally first before production

---

**Last Updated:** Today
**Status:** ✅ Ready to Use
