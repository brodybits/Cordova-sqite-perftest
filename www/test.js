function sqlTest(resultHandler) {
  var db = window.sqlitePlugin.openDatabase({name: 'test.db', location: 'default'});

  if (!db) return resultHandler('FAILED: no valid db handle');

  db.transaction(function(tx) {
    tx.executeSql("SELECT upper('Test string') AS upper_text", [], function(ignored, resultSet) {
      if (!resultSet) return resultHandler('FAILED: MISSING valid resultSet');
      if (!resultSet.rows) return resultHandler('FAILED: MISSING valid resultSet.rows');
      if (!resultSet.rows.length) return resultHandler('FAILED: MISSING valid resultSet.rows.length');
      if (resultSet.rows.length !== 1) return resultHandler('FAILED: INCORRECT resultSet.rows.length value: ' + resultSet.rows.length);
      if (!resultSet.rows.item(0)) return resultHandler('FAILED: MISSING valid resultSet.rows.item(0)');
      if (!resultSet.rows.item(0).upper_text) return resultHandler('FAILED: MISSING valid resultSet.rows.item(0).upper_text');

      resultHandler('RESULT: GOT resultSet.rows.item(0).upper_text: ' + resultSet.rows.item(0).upper_text);
    });
  }, function(error) {
      resultHandler('FAILED: transaction error message: ' + error.message);
  });
}

function start() {
  function handleResult(resultText) {
    navigator.notification.alert('Got result: ' + resultText, null, 'Cordova SQL Test');
  }
  sqlTest(handleResult);
}

document.addEventListener('deviceready', function() {
  navigator.notification.alert('received deviceready event', start, 'Cordova SQL Test');
});
