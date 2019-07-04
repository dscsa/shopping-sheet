function debugEmail() {

  var quota = MailApp.getRemainingDailyQuota()

  if (quota < 200) {
    return Log.apply(this, arguments)
  }

  var subject = 'v6 Debug '+getCaller()+" "+(1501 - quota)+" of 1500. Elapsed secs "+Math.floor((new Date() - scriptId)/1000)
  var body = '<pre>'+argArray(arguments).join('\n\n')+'</pre>'
  sendEmail(subject, body.split('\n'))
}

function infoEmail() {

  var quota = MailApp.getRemainingDailyQuota()

  if (quota < 300) {
    return Log.apply(this, arguments)
  }

  var subject = 'v6 Info '+getCaller()+" "+(1501 - quota)+" of 1500. Elapsed secs "+Math.floor((new Date() - scriptId)/1000)
  var body = '<pre>'+argArray(arguments).join('\n\n')+'</pre>'
  sendEmail(subject, body.split('\n'))
}

function Log() {
  console.log.apply(console, arguments)
  Logger.log(argArray(arguments, ['Log', getCaller()]).join(' '))
}

function argArray(args, prepend) {
  prepend = prepend || []
  for (var i in args) {

    if (args[i] instanceof Error)
      args[i] = '\nError: "'+args[i].message+'"'+(args[i].stack ? ' '+args[i].stack.trim().split('\n') : '')+'\n\n' //only stack if Error is thrown

    if (args[i] && typeof args[i] == 'object') {
      args[i] = '<pre>'+JSON.stringify(args[i], null, ' ')+'</pre>'
    }

    prepend.push(args[i])
  }
  return prepend
}

function getCaller() {
  try { //weirdly new Error().stack is null, must throw
    throw new Error()
  } catch (err) {
    return err.stack.split('\n')[2].trim()
  }
}

function sendEmail(to, subject, body, attachments) {


  Log('sendEmail', to, subject, body)

  var  cc = ''
  var bcc = ''

  if ( ! to) {
    bcc = 'adam@sirum.org'
  }
  else if ( ~ to.indexOf('@')) {

    var prevMessage = mainCache.get(to) || ''
    var msgHistory  = scriptId.toJSON()+': '+subject+'<br>'+body+'<br>'+prevMessage

    var wasShipped  = ~ prevMessage.indexOf('items has shipped')
    var  isShipped  = ~ msgHistory.indexOf('items has shipped')

    //Override cache if this email is a shipped email and the previous email was not
    var noCacheIfShipped  = wasShipped ? true : ! isShipped
    var noCacheIfInternal = ! ~ to.indexOf('@sirum.org') && ! ~ to.indexOf('@goodpill.org')

    mainCache.put(to, msgHistory.slice(0, 10000), 4*60*60)

    if (prevMessage && noCacheIfShipped && noCacheIfInternal)
      return debugEmail('Stop email spam', 'to', to, msgHistory)

    if ( ! LIVE_MODE) to = ''
    bcc = 'adam@sirum.org'
  }
  else {
    attachments = body
    body    = subject
    subject = to
    to      = 'adam@sirum.org'
  }

  var opts = {
      from:'support@goodpill.org',
      name:'Good Pill Pharmacy',
      to:to,
      cc:cc,
      bcc:bcc,
      subject:'v6 '+subject,
      htmlBody:body.join ? body.join('<br>') : body,
      attachments:attachments
    }

  try {

    if (MailApp.getRemainingDailyQuota() < 1) //Put in try because this was throwing an error once in a while "We're sorry, a server error occurred"
      return Log('Skipping email since likely over quota and email failures are time-consuming')

    GmailApp.sendEmail(to, subject, '', opts)
    //MailApp.sendEmail(opts)
  } catch (e) {
    //TODO confirm this by checking if error matches "Email quota likely reached Exception: Service invoked too many times for one day: email."  "
    Log('Email Not Sent Error', e.message, e.stack, opts.htmlBody.length, opts)
    Log('Email Not Sent Body', opts.htmlBody)

    if ( ! ~ e.message.indexOf('Limit Exceeded: Email Body Size'))
      throw ['Email Not Sent',  e.message, e.stack, opts]
    else
      debugEmail('Limit Exceeded: Email Body Size', to, subject, opts.htmlBody.slice(0, 2000))
  }
}
