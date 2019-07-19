

//Simple Trigger, doesn't need to be registered
function onOpen() {
  SpreadsheetApp.getUi() // Or DocumentApp or FormApp.
      .createMenu('Shopping')
      .addItem('Refresh Shopping Sheet', 'refreshShopping')
      .addItem('Update Order Invoice', 'updateInvoice')
      .addItem('Fax Transfer Out', 'createTransferFax')
      .addItem('Unlock', 'unlockScript')
      .addToUi();
}

//This is run by aksecure@sirum.org so that:
//1) GmailApp can be used to send emails as if aksecure is the support account, since it has a gmail alias
//2) So that we can "protect" the sheets from the support@goodpill.org user while this script runs.  (A user can't remove their own privledges)
function triggerShopping() {

  try {
    var unlock = lock()
    if (unlock) {
      mainLoop()
      unlock()
    }
  } catch (e) {
    if (unlock) unlock()
    debugEmail('triggerShopping error', 'scriptId', scriptId, e, e.stack, mainCache)
  }
}

function refreshShopping() {
  try {
    var unlock = lock()

    if ( ! unlock)
      throw new Error('Sheet is already running, try again later')

    mainLoop()
    unlock()

  } catch (e) {
    if (unlock) unlock()
    debugEmail('updateShopping error', 'scriptId', scriptId, e, e.stack, mainCache)
    throw e //Since this was run manually, show the error to the user
  }
}

//ScriptLock, CacheLock (ScriptLock was not always working!), and Protect Sheets from User Edits
function lock() {

  var lock = LockService.getScriptLock();

  if ( ! lock.tryLock(1000)) return Log('Script is Locked '+scriptId.toJSON())

  var updateShoppingLock = mainCache.get('updateShoppingLock')

  if (updateShoppingLock)
    return //debugEmail('updateShoppingLock was set even though getScriptLock succeeded', 'Locked at:', updateShoppingLock, 'Failed at:', scriptId.toJSON())

  mainCache.put('updateShoppingLock', scriptId.toJSON(), 30*60)

  var shopping = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Shopping')
  var shipped = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Shipped')

  var protectShopping = shopping.protect().setDescription('Autoprotect Shopping Sheet: '+scriptId).setWarningOnly(true)
  var protectShipped  =  shipped.protect().setDescription('Autoprotect Shipped Sheet: '+scriptId).setWarningOnly(true)

  //Note this won't work if user is support@goodpill.org (e.g. "Refresh Shopping Sheet" is called by User from Menu)
  //if (protectShopping.canDomainEdit()) protectShopping.setDomainEdit(false).removeEditor('support@goodpill.org') //Not available when setWarningOnly(true)
  //if (protectShipped.canDomainEdit()) protectShipped.setDomainEdit(false).removeEditor('support@goodpill.org')   //Not available when setWarningOnly(true)

  return function unlock() {
    if (protectShopping.remove) protectShopping.remove()
    if (protectShipped.remove) protectShipped.remove()
    if (mainCache.remove) mainCache.remove('updateShoppingLock')
    if (lock.releaseLock) lock.releaseLock()
  }
}

//TODO, add unprotect sheets as well
function unlockScript() {
  if (mainCache.remove) mainCache.remove('updateShoppingLock')
}
