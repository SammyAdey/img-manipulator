const express = require("express");
const app = express();
const { processImageFromQueue } = require("./logic/processImage");
const { getQueueUrl } = require("./logic/queue");
const imageStatus = require("./routes/imageStatus");
var cors = require("cors");
const AWS = require("aws-sdk");
// const http = require("http");
const PORT = 3000;
require("dotenv").config();

(async () => {
	const { QueueUrl } = await getQueueUrl();
	console.log("\n" + QueueUrl + "\n");
	processImageFromQueue(QueueUrl);
})();

// Middleware to parse JSON data from the request body
app.use(express.json());
// Middleware to enable CORS
app.use(cors());

app.use("/image", imageStatus);
// app.use("/queue", queue);
app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}/`);
});
