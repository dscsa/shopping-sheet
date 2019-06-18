
function setOrderStatus(order, oldStatus) {

  var isMissingRx  = true
  var isDispensing = false

  for (var i in order.$Drugs) {
    isMissingRx  = isMissingRx  && ! order.$Drugs[i].$InOrder
    isDispensing = isDispensing || order.$Drugs[i].$IsDispensed
  }

  if (order.$Tracking)
    order.$Status = 'Shipped'
  else if (isMissingRx)
    order.$Status = 'Missing Rx'
  else if (order.$OrderDispensed) //drug details might not be run so $Days could be NULL
    order.$Status = 'Dispensed'
  else if (isDispensing) //Solve reshopping for drugs that Cindy is about to dispense. This could also be solved by looking to see if the drug was automatically addded to order or whether Cindy added it herself
    order.$Status = 'Dispensing'
  else if ( ! order.$Pharmacy.short)
    order.$Status = 'Needs Form'
  else
    order.$Status = 'Shopping'
}

////indexOf rather than != because of "Shopping List" vs "=HYPERLINK(url, 'Shopping List')".  Default to null since "" will be !true
function didStatusChange(oldStatus, newStatus) {

  if (newStatus == 'Shopping' && (oldStatus == 'Delayed' || oldStatus == 'Not Filling')) return false

  if (newStatus == 'Dispensing' && oldStatus == 'Shopping') return false //Don't trigger changes until we get to "Dispensed" otherwise we might send customer changes in batches

  return oldStatus && ! ~ oldStatus.indexOf(newStatus || null)
}

function setPriceFeesDue(order) {

  order.$Total = 0

  for (var i in order.$Drugs)
    setPriceTotal(order, order.$Drugs[i])

  setFeeDue(order) //User may have changed $Days and $Prices so recalculate totals
}

function setPriceTotal(order, drug) {
  drug.$Price  = +Math.max(drug.$Days * drug.$MonthlyPrice / 30, drug.$Days ? 1 : 0).toFixed(0) || 0 //Minimum price of $1 (CK suggestion).  2019-01-28 Changed $Excluded to $Days because of Order 8235 and 8291

  order.$Total = (order.$Total || 0) + drug.$Price
}

function setFeeDue(order) {

  order.$Fee = order.$New ? 6 : order.$Total

  order.$Due = order.$Fee

  if (order.$Coupon && order.$Coupon.slice(0, 6) != "track_") {
    order.$Fee = order.$Total
    order.$Due = 0
  }
  else if (order.$Card) {
    var start = Utilities.formatDate(new Date(scriptId.getFullYear(), scriptId.getMonth() + 1, 1), "ET", "MM/dd")
    var stop  = Utilities.formatDate(new Date(scriptId.getFullYear(), scriptId.getMonth() + 1, 7), "ET", "MM/dd/yy")

    order.$BilledAt = start+'-'+stop
    order.$Due = 0
  }
}

function payment(order) {

  if (order.$Coupon && order.$Coupon.slice(0, 6) != "track_")
    return payment.COUPON

  if (order.$Card)
    return payment.AUTOPAY

  return payment.MANUAL
}

payment.AUTOPAY = 'AUTOPAY'
payment.COUPON  = 'COUPON'
payment.MANUAL  = 'MANUAL'
