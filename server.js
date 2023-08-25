var admin = require("firebase-admin");
var FormData = require("form-data");
const axios = require("axios");
const fs = require("fs");

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const multer = require("multer");
var serviceAccount = require("./secret/traffictracking-a103e-firebase-adminsdk-c3gli-47524e825f.json");
const bodyParser = require("body-parser");
const express = require("express");
var PORT = process.env.PORT || 3000;
var upload = multer({ storage: multer.memoryStorage() });

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://traffictracking-a103e-default-rtdb.asia-southeast1.firebasedatabase.app",
});
const db = getFirestore();
var app = express();
app.listen(PORT, () => {
  console.log("Exress listen on PORT: " + PORT);
});

async function main() {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.get("/", (req, res) => {
    res.send("hello");
  });

  app.use("/upload.html", express.static("static"));

  app.post("/");

  app.post("/predict_video", upload.single("video"), async (req, res) => {
    //req.get({url: 'http://end-point', headers: req.headers});
    // This registration token comes from the client FCM SDKs.
    const newArtifact = db.collection("artifacts").doc();
    await newArtifact.set({
      name: req.file.originalname,
      path: "",
    });

    await db
      .collection("user")
      .doc(req.body.userId)
      .update({
        artifacts: FieldValue.arrayUnion("artifacts/" + newArtifact.id),
      });
    const formFile = new FormData();
    formFile.append("video", req.file.buffer, req.file.originalname);
    formFile.append("id", newArtifact.id);
    const response = await axios.post(
      "https://rtmdet-s-server-e4b8cd044511.herokuapp.com/upload_video",
      formFile,
      {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${formFile._boundary}`,
        },
      }
    );
    if (response.status == 200) {
      res.status(200).send("Success add to queue");
      newArtifact.update({ name: response.data.name });
      const userRef = await db.collection("user").doc(req.body.userId).get();
      const registrationToken = userRef.data().deviceId;
      console.log(response);
      const message = {
        notification: {
          title:
            "Video " + req.file.originalname + " has been sent to inference.",
          body:
            "Video " +
            req.file.originalname +
            " has been sent to inference with name: " +
            response.data.name +
            ". We'll inform you when the inference is complete",
        },
        android: {
          notification: {
            icon: "stock_ticker_update",
            color: "#7e55c3",
          },
        },
        token: registrationToken,
      };

      // Send a message to the device corresponding to the provided
      // registration token.
      admin
        .messaging()
        .send(message)
        .then((response) => {
          // Response is a message ID string.
          console.log("Successfully sent message:", response);
        })
        .catch((error) => {
          console.log("Error sending message:", error);
        });
    } else {
      res.status(500).send("Something wrong happened. We trying to figure out");
    }
  });
  app.get("/artifacts/:id", async (req, res) => {
    const usersRef = db.collection("artifacts").doc(req.params.id);

    usersRef.get().then((docSnapshot) => {
      if (docSnapshot.exists) {
        res
          .status(200)
          .json({ id: req.params.id, path: docSnapshot.data().path });
      } else {
        res.status(404).json({ message: "Artifact not found" }); // create the document
      }
    });
  });
  app.patch("/artifacts/:id", async (req, res) => {
    var artifactRef = await db.collection("artifacts").doc(req.params.id);
    artifactRef.get().then(async (snapshot) => {
      if (snapshot.exists) {
        artifactRef.update({ path: req.body.path });
        const artifacts = await db
          .collection("artifacts")
          .doc(req.params.id)
          .get();
        const userRef = await db.collection("user");
        const queryRef = await userRef
          .where("artifacts", "array-contains", "artifacts/" + req.params.id)
          .get();
        res.status(200).send("Done saving artifact " + artifacts.data().name);
        var registrationToken = [];
        queryRef.forEach((element) => {
          console.log(element.data().deviceId);
          registrationToken.push(element.data().deviceId);
        });
        console.log(registrationToken);
        const message = {
          notification: {
            title: "Video " + artifacts.name + " has done inference.",
            body:
              "Video " +
              artifacts.name +
              " has done inference. Click here to see the video",
          },
          android: {
            notification: {
              icon: "stock_ticker_update",
              color: "#7e55c3",
            },
          },
          tokens: registrationToken,
        };

        admin
          .messaging()
          .sendMulticast(message)
          .then((response) => {
            // Response is a message ID string.
            console.log("Successfully sent message:", response);
          })
          .catch((error) => {
            console.log("Error sending message:", error);
          });
      } else {
        res.status(404).json({ message: "Artifact not found" });
      }
    });
  });
}

main();
