#!/usr/bin/env bash

set -e

echo "=== singletest.sh Debug Info ==="
echo "Parameter 1 (browser):       '$1'"
echo "Parameter 2 (jobsize):       '$2'"
echo "Parameter 3 (job):           '$3'"
echo "Parameter 4 (scriptparameter): '$4'"
echo "================================"

TESTFILES=$(grep -IRiL "\'@disabled\': \?true" "dist/apps/remix-ide-e2e/src/tests" | awk -F/ '{print $NF}' | sed 's/\.[tj]s$//' | grep -i "${4}" | while read base; do find dist/apps/remix-ide-e2e/src/tests -type f -name "${base}.[tj]s"; done | sort)

echo "=== Test Files Found ==="
echo "$TESTFILES"
echo "========================="

# count test files
fileCount=$(echo "$TESTFILES" | wc -l)
# if fileCount is 0
if [ $fileCount -eq 0 ]
then
  echo "No flaky or PR tests found"
  exit 0
fi

BUILD_ID=${CIRCLE_BUILD_NUM:-${TRAVIS_JOB_NUMBER}}
echo "$BUILD_ID"
TEST_EXITCODE=0

npx ganache &
npx http-server -p 9090 --cors='*' ./node_modules &
yarn run serve:production &
sleep 5

for TESTFILE in $TESTFILES; do
    npx nightwatch --config dist/apps/remix-ide-e2e/nightwatch-${1}.js $TESTFILE --env=$1  || TEST_EXITCODE=1
done

echo "$TEST_EXITCODE"
if [ "$TEST_EXITCODE" -eq 1 ]
then
  exit 1
fi
