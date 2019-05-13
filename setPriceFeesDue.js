function setPriceFeesDue(order) {
  order.$Due = setFee(order)
  order.$BilledAt = "N/A"

  if (order.$Coupon && order.$Coupon.slice(0, 6) != "track_") order.$Due = 0
  else if (order.$Card) {
    var start = Utilities.formatDate(new Date(scriptId.getFullYear(), scriptId.getMonth() + 1, 1), "ET", "MM/dd")
    var stop  = Utilities.formatDate(new Date(scriptId.getFullYear(), scriptId.getMonth() + 1, 7), "ET", "MM/dd/yy")

    order.$BilledAt = start+'-'+stop
    order.$Due = 0
  }
}

function setFee(order) {
  setTotal(order)
  return order.$Fee = order.$New ? 6 : order.$Total
}

function setTotal(order) {
  return order.$Total = order.$Drugs.reduce(function(sum, drug) { return sum + setPrice(drug) }, 0)
}

function setPrice(drug) {
  return drug.$Price = +Math.max(drug.$Days * drug.$MonthlyPrice / 30, drug.$Days ? 1 : 0).toFixed(0) || 0 //Minimum price of $1 (CK suggestion).  2019-01-28 Changed $Excluded to $Days because of Order 8235 and 8291
}
