window.onmessage = function(event) {
  console.log(event)
  event.target.postMessage(`<echo>${event.data}`)
}
