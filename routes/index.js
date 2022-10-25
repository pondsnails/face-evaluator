var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const { content } = require('googleapis/build/src/apis/content');
const { file } = require('googleapis/build/src/apis/file');
const SCOPES = [
  `https://www.googleapis.com/auth/drive`,
];
const TOKEN_PATH = "token.json";
const FOLDER_ID_PATH = "folder-id.json";
var waitingFileStatus = [];
var shownFileStatus;
var doneList = [];
var value;
var ratedImagesFolderList = {};
var genFolders = {};
var folderIdList;

router.use(express.static('public'));
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());

fs.readFile(FOLDER_ID_PATH, (err, content) => {
  if (err) return console.log("Error loading client secret file:", err);
  folderIdList = JSON.parse(content)
  console.log(folderIdList)
});

//GET時の処理
router.get('/', (req, res) => {
  readFile(ListFiles)
  if (waitingFileStatus.length != 0) {
    shownFileStatus = waitingFileStatus[0]
    if (shownFileStatus["name"] != undefined) {
      yNum = Number(shownFileStatus['name'].split(/x|y/)[1].replace(/[^0-9]/g, '')) * 30;
      xNum = Number(shownFileStatus['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''));
      gen = shownFileStatus["parents_name"].replace(/[^0-9]/g, '');
      res.render('index.ejs', { image_link: shownFileStatus["link"], parents_name: gen + "世代", file_name: String(yNum + xNum) + "番" });
      console.log("GET:"+String(yNum+xNum)+"番")
    }
  } else {
    res.render('index.ejs', { image_link: "", parents_name: "画像なし", file_name: "" })
  }
  waitingFileStatus.shift()
});

//POST時の処理
router.post('/', (req, res) => {
  value = req.body.value;
  if (shownFileStatus != undefined) {
    readFile(collectFolders)
  }
  readFile(ListFiles)
  if (waitingFileStatus.length != 0) {
    shownFileStatus = waitingFileStatus[0]
    if (shownFileStatus["name"] != undefined) {
      yNum = Number(shownFileStatus['name'].split(/x|y/)[1].replace(/[^0-9]/g, '')) * 30;
      xNum = Number(shownFileStatus['name'].split(/x|y/)[2].replace(/[^0-9]/g, ''));
      gen = shownFileStatus["parents_name"].replace(/[^0-9]/g, '');
      res.render('index.ejs', { image_link: shownFileStatus["link"], parents_name: gen + "世代", file_name: String(yNum + xNum) + "番" })
      doneList.push(shownFileStatus["id"])
    }
    console.log("POST:"+String(yNum+xNum)+"番")
    waitingFileStatus.splice(waitingFileStatus.indexOf(shownFileStatus),1)
    while(waitingFileStatus.length > 5) {
      waitingFileStatus.pop()
    }
  }
  res.end

})

readFile(ListFiles)
module.exports = router;

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
  console.log("Authorize this router by visiting this url:", authUrl);
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
  generatedMenFolderId = folderIdList['generatedMenFolderId']
  const params = {
    q: `'${generatedMenFolderId}' in parents and trashed = false`,
    pageSize: 3,
  }

  try {
    const res = await drive.files.list(params);
    const files = res.data.files;
    if (files.length) {
      files.map((file) => {
        if (file.name.includes("gen_")) {
          genFolders[file.id] = file.name
        }
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
    pageSize: 5,
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
          if (file.id != undefined) {
            waitingFileStatus.push({ id: file.id, parents: folderId, link: "https://drive.google.com/uc?id=" + file.id + "&png", name: file.name, parents_name: genFolders[folderId] })
          }
        }
      })
    })
  removeDuplicationShownFile()
}

// 評価フォルダの検索
async function collectFolders(auth) {
  ratedMenFolderId = folderIdList['ratedMenFolderId'];
  const drive = google.drive({ version: "v3", auth });
  const params = {
    q: `'${ratedMenFolderId}' in parents and trashed = false`,
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
    drive.files.update({
      fileId: shownFileStatus["id"],
      addParents: ratedImagesFolderList[String(value)],
      removeParents: shownFileStatus["parents"],
      fields: 'id, parents',
    });

    // Google Driveとの遅延を考慮,評価済みの画像を取得しても送信済みであればリストから削除
    if (doneList.length > 10) doneList.shift();
    for (let i = 0; i < doneList.length; i++) {
      waitingFileStatus = waitingFileStatus.filter(file => {
        return ((file.id != doneList[i]));
      });
    }
  } catch (err) {
    throw err;
  }
}

