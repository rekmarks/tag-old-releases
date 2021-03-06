var exec = require('child_process').execSync;
var _ = require('lodash');
var argv = require('boring')();
var history = exec('git log -p', {
  encoding: 'utf8',
  maxBuffer: 500*1024*1024
});
var tags = exec('git tag', {
  encoding: 'utf8'
}).split('\n');
var tagMap = {};
// map existing tags
tags.forEach(function (tag) {
  tagMap[tag] = true;
});
var regex = /\ncommit (\w+)/g;
var result;
var version;
var commit;
var previousVersion;
var previousCommit;
var fs = require('fs');
var compare = require('semver-compare');
var matches = history.match(/^commit (\w+)/);
var mainBranch = argv.branch || 'master';
commit = matches[1];
previousCommit = commit;

// Get the version from package.json
function getVersion(){
  // skip this commit if there isn't a package.json to get the version
  if (!fs.existsSync('package.json')) {
    return null;
  }
  var pkg = fs.readFileSync('package.json');
  // get the version of the application in that commit
  try {
    return JSON.parse(pkg).version;
  } catch (err) {
    return (/"version": "([\d.]+)"/g.exec(pkg))[1];
  }
}

var latestVersion = `7.0.0`;
var previousVersion = latestVersion;
var newTags = {};

// iterate from last to first commit in history
while (true) {
  // get next commit
  result = regex.exec(history);
  if (!result) {
    break;
  }
  // get commit id from regex result
  commit = result[1];

  try {
    exec('git clean -f -d && git checkout --quiet ' + commit);
  } catch (error) {
    console.log(error.message);
    continue;
  }

  version = getVersion()

  if(!version) continue;

  // if the version is greater than the last one from the main branch skip this version
  if (compare(version, latestVersion) > 0) {
    continue;
  }

  // if version is not the same of the previousVersion and is not already tagged (!tagMap[previousVersion])
  // add the previous version to the newTags object
  if (version !== previousVersion) {
    if (!tagMap[previousVersion] && !tagMap[`v${previousVersion}`]) {
      // Due to merges the oldest commit for a version may be a
      // ways back, so just keep overwriting and output them at the end
      newTags[previousVersion] = previousCommit;
      console.log('new candidate for ' + previousVersion + ' is ' + previousCommit);
    }
  }
  previousCommit = commit;
  previousVersion = version;
}

const getTagCommand = (commit, version) => `git tag v${version} ${commit}`

exec('git checkout --quiet ' + mainBranch);
_.each(newTags, function (commit, version) {
  console.log(getTagCommand(commit, version));
  if (!argv['dry-run']) {
    exec(getTagCommand(commit, version));
  }
});

console.log('Finished.');
if (!argv['dry-run']) {
  exec(getTagCommand(commit, version));
  console.log('Do not forget to run "git push --tags" if you are satisfied.');
}
