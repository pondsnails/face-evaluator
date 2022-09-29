const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const { resolve } = require('path');
const { file } = require('googleapis/build/src/apis/file');
const SCOPES = [
  `https://www.googleapis.com/auth/drive`,
];
const TOKEN_PATH = "token.json";
var waitingFileStatus = [];
var shownFileStatus;
var previousFileStatus;
var doneList = [];
var value;
var ratedImagesFolderList = {};
var genFolders = {};
var gen;
var num;

main()

async function main() {

  app.use(express.static('public'));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  //GET時の処理
  app.get('/', (req, res) => {
    readFile(ListFiles)
    if (waitingFileStatus.length != 0) {
      var n = (waitingFileStatus.length == 1) ? 0 : 1;
      shownFileStatus = waitingFileStatus[n]
      previousFileStatus = shownFileStatus;
      num = Number(shownFileStatus['name'].split(/x|y/)[1].replace(/[^0-9]/g, '')) * 30 + Number(shownFileStatus['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''))
      gen = shownFileStatus["parents_name"].replace(/[^0-9]/g, '')
      res.render('index.ejs', { image_link: shownFileStatus["link"], parents_name: gen + "世代", file_name: String(num) + "番" })
      console.log("Now, Generation", gen, "No." + num, "is displayed")
    }

    waitingFileStatus.shift()
  });

  //POST時の処理
  app.post('/', (req, res) => {
    value = req.body.value;
    if (shownFileStatus != undefined) {
      readFile(collectFolders)
    }
    readFile(ListFiles)
    if (waitingFileStatus.length != 0) {
      var n = (waitingFileStatus.length == 1) ? 0 : 1;
      shownFileStatus = waitingFileStatus[n]
      num = Number(shownFileStatus['name'].split(/x|y/)[1].replace(/[^0-9]/g, '')) * 30 + Number(shownFileStatus['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''))
      gen = shownFileStatus["parents_name"].replace(/[^0-9]/g, '')
      res.render('index.ejs', { image_link: shownFileStatus["link"], parents_name: gen + "世代", file_name: String(num) + "番" })
    }
    waitingFileStatus.shift()
    console.log("Now, Generation", gen, "No." + num, "is being displaying")
    res.end

  })
  readFile(ListFiles)

  app.listen(3000)

}

// 事前に取得したファイルの重複を削除
function removeDuplicationShownFile() {
  const result = waitingFileStatus.filter((element, index, self) =>
    self.findIndex(e => e.id === element.id) === index
  );
  waitingFileStatus = result;
}

// 証明書の確認
async function readFile(callback) {

  // Load client secrets from a local file.
  fs.readFile("credentials.json", (err, content) => {
    if (err) return console.log("Error loading client secret file:", err);
    // Authorize a client with credentials, then call the Google Drive API.
    authorize(JSON.parse(content), callback);
  });

}

// 承認
async function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // 以前にトークンを保存したかどうかを確認
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
ユーザーの認証を促した後、新しいトークンを取得・保存
認可された OAuth2 クライアントで、指定されたコールバックを実行
 */
async function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // トークンをディスクに保存し、後でプログラムを実行できるように
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}


// Google Driveにあるファイルを取得
async function ListFiles(auth) {

  const drive = google.drive({ version: 'v3', auth });
  const generatedImagesFolderId = '1s2xTD5FyaVK_L0clDhnL2Hh80pmWFgNC'
  const params = { 
    q: `'${generatedImagesFolderId}' in parents and trashed = false`,
    pageSize: 3,
 }

  try {
    const res = await drive.files.list(params);
    const files = res.data.files;
    if (files.length) {
      files.map((file) => {
        recursiveListFiles(auth, file.id, 0)
      });
    } else {
      console.log('No files found.');
    }
  } catch (err) {
    console.log('The API returned an error: ' + err);
  }

}

//　再帰的なフォルダ検索
async function recursiveListFiles(auth, folderId, count) {
  var str = "";
  for (let i = 0; i < count + 1; i++) str += " -";
  const drive = google.drive({ version: "v3", auth });
  const params = {
    pageSize: 2,
    q: `'${folderId}' in parents and trashed = false`,
  }
  await drive.files
    .list(params)
    .then((response) => {
      const files = response.data.files;
      files.map((file) => {
        recursiveListFiles(auth, file.id, count + 1);
        if (file.name.includes("gen_")) {
          genFolders[file.id] = file.name
        }
        if (file.name.includes("split_y")) {
          waitingFileStatus.push({ id: file.id, parents: folderId, link: "https://drive.google.com/uc?id=" + file.id + "&png", name: file.name, parents_name: genFolders[folderId] })
        }
      })
    })

  removeDuplicationShownFile()
}

// 評価フォルダの検索
async function collectFolders(auth) {
  const ratedMenImagesFolderId = "1gJGhVEE6DxOVZHKoIamO4P0rCBy9p_ZJ"
  const drive = google.drive({ version: "v3", auth });
  const params = {
    q: `'${ratedMenImagesFolderId}' in parents and trashed = false`,
  }
  await drive.files
    .list(params)
    .then((response) => {
      const files = response.data.files;
      files.map((file) => {
        ratedImagesFolderList[file.name] = file.id
      })
    }).then(() => {
      return rateImages(auth)
    })
}

// 評価画像の転送
async function rateImages(auth) {

  const drive = google.drive({ version: 'v3', auth });


  try {
    var FileToBeSent = (previousFileStatus != undefined) ? previousFileStatus : shownFileStatus;
    drive.files.update({
      fileId: FileToBeSent["id"],
      addParents: ratedImagesFolderList[String(value)],
      removeParents: FileToBeSent["parents"],
      fields: 'id, parents',
    });
    console.log("Successed in rating image:",
      "Generation", FileToBeSent["parents_name"].replace(/[^0-9]/g, ''),
      "No." + (Number(FileToBeSent['name'].split(/x|y/)[1].replace(/[^0-9]/g, '')) * 30 + Number(FileToBeSent['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''))),
      "to", value)

    previousFileStatus = shownFileStatus
    doneList.push(FileToBeSent["id"]);
    if (doneList.length > 10) doneList.shift();
    for (let i = 0; i < doneList.length; i++) {
      waitingFileStatus = waitingFileStatus.filter(file => {
        return ((file.id != doneList[i]));
      });
    }
    return;

  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
}