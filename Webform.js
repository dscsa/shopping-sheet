function updateWebformShipped(order, invoice) {

    //Duplicate some saves from updateWebformDispensed just to make sure they are saved.  However, don't re-add the shipping (admin fee) because that appears to be cumulative
    //Also sometimes Cindy call "Update Order Invoice" on the Shopping Sheet which provides a new invoice_doc_id that we need to save and overwrite the old one
    var woocommerceOrder = {
      meta_data:[
        {key:"guardian_id", value:order.$Patient.guardian_id},
        {key:"tracking_number", value:order.$Tracking},
        {key:"date_shipped", value:new Date().toDateString()},
        {key:"invoice_doc_id", value:invoice && invoice.getId() || ''},
        {key:"invoice_number", value:order.$OrderId},
      ],
      shipping_lines:[{method_id:'flat_rate', total:order.$Fee+''}] //Must be a string
    }

    webformPayMethod(order, woocommerceOrder, 'updateWebformShipped')

    //Order was already created (1) by user when registering, or (2) by status update when rx recieved
    updateWebformOrder(order.$OrderId, woocommerceOrder)
}

function updateWebformDispensed(order, invoice) {

    var email = order.$Patient.email.replace(/ |NULL/g, '')

    //one email was the string "NULL".  some placeholder emails in fname lname DOB@sirum.org format were accidentally saved with spaces and are rejected by woocommerce.  Empty string & undefined (#8350 & #8375) emails are invalid
    if ( ! email) {
      //debugEmail('saving to webform without a patient email', email, order, invoice, fee)
      email = "missing_email@goodpill.org"
    }

    var address = {
      first_name:order.$Patient.first,
      last_name:order.$Patient.last,
      address_1:order.$Patient.address_1,
      address_2:order.$Patient.address_2,
      city:order.$Patient.city,
      state:order.$Patient.state,
      postcode:order.$Patient.zip,
      email:email,
      phone:order.$Patient.phone1
    }

    var woocommerceOrder = {
      meta_data:[
        {key:"date_dispensed", value:new Date().toDateString()},
        {key:"guardian_id", value:order.$Patient.guardian_id},
        {key:"invoice_number", value:order.$OrderId},
        {key:"invoice_doc_id", value:invoice && invoice.getId() || ''} //cannot be null otherwise nothing saves
      ],
      shipping_lines:[{method_id:'flat_rate', total:order.$Fee+''}] //Must be a string

    }

    webformPayMethod(order, woocommerceOrder, 'updateWebformDispensed')

    infoEmail('updateWebformDispensed', '#'+order.$OrderId, woocommerceOrder, address, order)
    //Order was already created (1) by user when registering, or (2) by status update when rx recieved
    updateWebformOrder(order.$OrderId, woocommerceOrder, address)
}

function updateWebformReceived(orderId, guardianId, status) {
  //infoEmail('updateStatus', orderId, guardianId, status)
  var order = {status:status, meta_data:[  //pass guardian id just in case this order does not exist
    {key:"date_received", value:new Date().toDateString()},
    {key:"invoice_number", value:orderId},
    {key:"guardian_id", value:guardianId}
  ]}

  return updateWebformOrder(orderId, order)
}

function createWebformOrder(orderId, woocommerceOrder) {
  try {
    return saveWebformOrder('post', 'orders', woocommerceOrder)
  } catch (err) {
    debugEmail('createWebformOrder failed', err, err.stack, '#'+orderId, woocommerceOrder)
  }
}

function updateWebformOrder(orderId, woocommerceOrder, address) {
  try {
    //infoEmail('updateWebformOrder', '#'+orderId, woocommerceOrder)
    var res = saveWebformOrder('put', 'orders/'+orderId, woocommerceOrder)

    if (res.code != "woocommerce_rest_shop_order_invalid_id") return res

  } catch (err) {
    //infoEmail('updateWebformOrder failed', err, '#'+orderId, woocommerceOrder)
  }

  if (address) { //Just to be certain we are HIPAA compliant, only change address information on creation
    woocommerceOrder.shipping = address
  }

  return createWebformOrder(orderId, woocommerceOrder) //if no order exists, then create one rather than throwing error
}

function saveWebformOrder(action, endpoint, woocommerceOrder) {

  if ( ! LIVE_MODE) return debugEmail('saveWebformOrder canceled because LIVE MODE OFF', action, endpoint, woocommerceOrder)

  var response = woocommerce[action](endpoint, woocommerceOrder)

  if ( ! response) debugEmail('saveWebformOrder error?'+action, action, endpoint, woocommerceOrder)

  try {
    var content = response.getContentText()

    var parsed = JSON.parse(content)
    var success = parsed.number || parsed.code == "refill_order_already_exists"

    if ( ! success)
      debugEmail('saveWebformOrder success?', 'action: '+action, 'endpoint: '+endpoint, 'http code: '+response.getResponseCode(), 'headers', response.getHeaders(), 'request', woocommerceOrder, 'response', parsed)

  } catch (e) {
    //This happens when we try to update an order that does not exist.  We catch this error and create the order
    //I could not figure out how to respond with a good error message to check for this by trying throwing/returning
    //errors from woocommerce but could not get it to work.  SOOOO just assume any error here means that we should try
    //creating the order rather than updating it
    var err = {
      e:e,
      stack:e.stack,
      content:content,
      response:response,
      action:action,
      endpoint:endpoint,
      woocommerceOrder:woocommerceOrder
    }

    Log('saveWebformOrder Error.  Most likely trying to update an order that needs to be created', err)
    throw err
  }
}

var woocommerce = {

  get:function(url) {
    return _fetch(url, 'get')
  },

  put:function(url, body) {
    return _fetch(url, 'put', body)
  },

  post:function(url, body) {
    return _fetch(url, 'post', body)
  }
}

function _fetch(url, method, body) {

  var opts = {
    method:method,
    payload:body ? JSON.stringify(body) : body,
    contentType: 'application/json',
    muteHttpExceptions:true,
    headers:{Authorization:"Basic " + Utilities.base64Encode(WP_AUTH)}
  }

  try {
    return UrlFetchApp.fetch('https://www.goodpill.org/wp-json/wc/v2/'+url, opts)
  } catch (e) {
    debugEmail('Could not fetch woocommerce.  Is site down?', e, 'https://goodpill.org/wp-json/wc/v2/'+url, opts)
  }
}

function webformPayMethod(order, woocommerceOrder, debugMsg) {

  var payMethod = payment(order)

  if (payMethod == payment.COUPON) {
    woocommerceOrder.status = 'shipped-coupon'
    woocommerceOrder.coupon_lines = [{code:order.$Coupon}]
  } else if (payMethod == payment.AUTOPAY) {
    woocommerceOrder.status = 'shipped-autopay'
    woocommerceOrder.payment_method = 'stripe'
  } else if (payMethod == payment.MANUAL){
    woocommerceOrder.status = 'shipped-unpaid'
    woocommerceOrder.payment_method = 'cheque'
  } else {
    debugEmail(debugMsg+' UNKNOWN Payment Method', payMethod, woocommerceOrder, order)
  }

}
