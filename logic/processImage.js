const S3 = require("aws-sdk/clients/s3");
const fs = require("fs");
const { processImage } = require("./img-manipulation.js");
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;
const { configDetails } = require("../config.js");
const { receiveMessage, deleteMessage } = require("./queue.js");
const util = require("util");
const unLinkFile = util.promisify(fs.unlink);
const path = require("path");
const axios = require("axios");

const s3 = new S3({ apiVersion: "2006-03-01" });

const downloadImage = async (key) => {
	console.log("\nImage Key From Download Image Function : " + key + "\n");
	const localFilePath = path.join("images/inputs/", key);
	const writeStream = fs.createWriteStream(localFilePath);
	const readStream = getFileStream(key);

	// Promisify the pipe method
	const pipeAsync = util.promisify(require("stream").pipeline);

	try {
		await pipeAsync(readStream, writeStream);
		console.log(`File downloaded successfully to: ${localFilePath}`);
		return localFilePath;
	} catch (err) {
		console.error("Error downloading file:", err);
		throw err; // Rethrow the error to handle it elsewhere, if needed
	}
};

const notifyProcessingComplete = async (processedImageKey) => {
	// Get the base URL dynamically from the request object
	const baseUrl = "http://localhost:3000";
	await axios
		.post(`${baseUrl}/image/complete`, {
			processedImageKey: processedImageKey,
		})
		.then((response) => {
			console.log("Processing completion notification sent. Server response:", response.data.message);
		})
		.catch((error) => {
			console.error("Error notifying processing complete:", error);
		});
};

const uploadS3 = (file) => {
	const path = `images/outputs/${file}`;
	const fileStream = fs.createReadStream(path);

	const uploadParams = {
		Bucket: configDetails.bucketName,
		Body: fileStream,
		Key: file,
	};

	return s3.upload(uploadParams).promise();
};

const imgManipulation = async (fileName) => {
	let result;
	try {
		result = await processImage(fileName, MAX_WIDTH, MAX_HEIGHT);
		console.log("Image resizing and GIF generation complete.");
	} catch (error) {
		console.error(error);
		console.log("Image not Processed");
	}

	return result;
};

const maxRetries = 5;
const delayInSeconds = 1;
const processImageFromQueue = async (queueUrl) => {
	const { Messages } = await receiveMessage(queueUrl);

	if (!Messages) {
		// Retry with exponential backoff
		console.log(`No image to process ...`);
		console.log(`Retrying in ${delayInSeconds * 10} seconds...`);
		setTimeout(() => processImageFromQueue(queueUrl), delayInSeconds * 1000);
	} else if (Messages.length === 1) {
		console.log("Queue Message Recieved \n");

		try {
			//Download Image
			const key = Messages[0].MessageAttributes.ImageId.StringValue;
			console.log("Image Key : " + key);
			await downloadImage(key);

			// Process Image
			const fileName = await imgManipulation(key);
			console.log("Processed File Filename : " + fileName);

			// Upload to Processed Image to S3
			const result = await uploadS3(fileName);
			console.log(result);

			// Delete Processed Image from Local Storage
			filePath = path.join("images/outputs/", fileName);
			await unLinkFile("images/inputs/" + key);
			await unLinkFile(filePath);

			// Call the /complete endpoint to mark processing as complete
			await notifyProcessingComplete(result.Key);
		} catch (error) {
			console.error(error);
		}

		// Delete Message from Queue
		await deleteMessage(Messages[0], queueUrl);
		processImageFromQueue(queueUrl);
	} else {
		// No messages received, continue polling
		processImageFromQueue(queueUrl);
	}
};

//downloads an image from s3
const getFileStream = (fileKey) => {
	const downloadParams = {
		Key: fileKey,
		Bucket: configDetails.bucketName,
	};

	return s3.getObject(downloadParams).createReadStream();
};

// Export all Modules
module.exports = {
	processImageFromQueue,
};
