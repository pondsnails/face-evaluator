const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const { resolve } = require('path');
const SCOPES = [
  `https://www.googleapis.com/auth/drive`,
];
const TOKEN_PATH = "token.json";
var shownFileStatus = [];
var previousFileStatus = [];
var value;
var ratedImagesFolderList = {};
var isProcessingCollectingFolders = false;
var genFolders = {};
var doneFiles = [];

main()

async function main() {

  app.use(express.static('public'));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  //GET時の処理
  app.get('/', (req, res) => {
    if (previousFileStatus.length > 0) {
      previousFileStatus = [];
    }

    readFile(ListFiles)
    if (shownFileStatus.length != 0) {
      if (shownFileStatus.length == 1) {
        previousFileStatus.push(shownFileStatus[0])
        num = Number(shownFileStatus[0]['name'].split(/x|y/)[1].replace(/[^0-9]/g, ''))*30+Number(shownFileStatus[0]['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''))
        console.log(num)
        res.render('index.ejs', { image_link: shownFileStatus[0]["link"], parents_name:  shownFileStatus[0]["parents_name"].replace(/[^0-9]/g, '')+"世代", file_name: String(num)+"番" })
      } else if (shownFileStatus.length > 1) {
        previousFileStatus.push(shownFileStatus[1])
        num = Number(shownFileStatus[1]['name'].split(/x|y/)[1].replace(/[^0-9]/g, ''))*30+Number(shownFileStatus[1]['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''))
        console.log(num)
        res.render('index.ejs', { image_link: shownFileStatus[1]["link"], parents_name: shownFileStatus[0]["parents_name"].replace(/[^0-9]/g, '')+"世代", file_name: String(num)+"番" })
      }
    }
    shownFileStatus.shift()
  });

  //POST時の処理
  app.post('/', (req, res) => {
    value = req.body.value;
    if (previousFileStatus.length != 0) {
      isProcessingCollectingFolders = true;
      readFile(collectFolders)
    }
    readFile(ListFiles)
    if (shownFileStatus.length != 0) {
      if (shownFileStatus.length == 1) {
        previousFileStatus.push(shownFileStatus[0])
        num = Number(shownFileStatus[0]['name'].split(/x|y/)[1].replace(/[^0-9]/g, ''))*30+Number(shownFileStatus[0]['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''))

        res.render('index.ejs', { image_link: shownFileStatus[0]["link"], parents_name: shownFileStatus[0]["parents_name"].replace(/[^0-9]/g, '')+"世代", file_name: String(num)+"番" })
      } else if (shownFileStatus.length > 1) {
        previousFileStatus.push(shownFileStatus[1])
        num = Number(shownFileStatus[1]['name'].split(/x|y/)[1].replace(/[^0-9]/g, ''))*30+Number(shownFileStatus[1]['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''))
        res.render('index.ejs', { image_link: shownFileStatus[1]["link"], parents_name: shownFileStatus[1]["parents_name"].replace(/[^0-9]/g, '')+"世代", file_name: String(num)+"番" })
      }
      previousFileStatus.forEach((file) => {
        file["value"] = value
      })

    }
    res.end
  })
  readFile(ListFiles)

  app.listen(8080)

}

// 事前に取得したファイルの重複を削除
function removeDuplication() {
  var check = [];
  shownFileStatus.forEach(function (list) {
    check[list.id] = (list.id in check) ? true : false;
  });

  var filtered = shownFileStatus.filter(function (e) {
    return false === check[e.id]
  });
  shownFileStatus = filtered;
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
  const params = { q: `'${generatedImagesFolderId}' in parents and trashed = false` }

  try {
    const res = await drive.files.list(params);
    const files = res.data.files;
    if (files.length) {
      // console.log('Files:');
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
  drive.files
    .list(params)
    .then((response) => {
      const files = response.data.files;
      files.map((file) => {
        // console.log(str, file.name, file.id)
        recursiveListFiles(auth, file.id, count + 1);
        if (file.name.includes("gen_")) {
          genFolders[file.id] = file.name
        }
        if (file.name.includes("split_y")) {
          shownFileStatus.push({ id: file.id, parents: folderId, link: "https://drive.google.com/uc?id=" + file.id + "&png", name: file.name, parents_name: genFolders[folderId] })
        }
      })
    })
  shownFileStatus = Array.from(new Set(shownFileStatus))
  removeDuplication()
}

// 評価フォルダの検索
async function collectFolders(auth) {
  const ratedMenImagesFolderId = "1gJGhVEE6DxOVZHKoIamO4P0rCBy9p_ZJ"
  const drive = google.drive({ version: "v3", auth });
  const params = {
    q: `'${ratedMenImagesFolderId}' in parents and trashed = false`,
  }
  drive.files
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
  previousFileStatus = [...new Set(previousFileStatus)]

  try {
    for (let i = 0; i < previousFileStatus.length; i++) {
      shownFileStatus = shownFileStatus.filter(function (file) {
        return file !== previousFileStatus[i]
      })
      drive.files.update({
        fileId: previousFileStatus[i]["id"],
        addParents: ratedImagesFolderList[previousFileStatus[i]["value"]],
        removeParents: previousFileStatus[i]["parents"],
        fields: 'id, parents',
      });

      console.log("Successed in rating image:", previousFileStatus[i]["parents_name"], previousFileStatus[i]["name"], "to", value)
      doneFiles.push(previousFileStatus[i]["id"])
      if (doneFiles.length > 10) {
        doneFiles.shift;
      }
      previousFileStatus = previousFileStatus.filter(file => {
        return ((file.id != previousFileStatus[i]["id"]));
      })

      isProcessingCollectingFolders = false;
    }
    return;
  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
}