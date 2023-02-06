import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./TranscriptsUploadPage.module.css";
import { useDropzone } from "react-dropzone";
import * as xlsx from "xlsx";
import Canvas from "./TranscriptsCanvas";
import template from "../../images/template.jpg";
import { useNavigate } from "react-router-dom";
import { useCVPContext } from "../../Context/CVPContext";
import { useAuth } from "../../Context/AuthContext";
import UploadIcon from "@mui/icons-material/Upload";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { ToastContainer, toast } from "react-toastify";

import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";

import * as PDFJS from "pdfjs-dist/webpack";

const baseStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "20px",
  borderWidth: 2,
  borderRadius: 2,
  borderColor: "#eeeeee",
  borderStyle: "dashed",
  backgroundColor: "#fafafa",
  color: "#bdbdbd",
  outline: "none",
  transition: "border .24s ease-in-out",
};

const focusedStyle = {
  borderColor: "#2196f3",
};

const acceptStyle = {
  borderColor: "#00e676",
};

const rejectStyle = {
  borderColor: "#ff1744",
};

const TranscriptsUploadPage = () => {
  const navigate = useNavigate();
  const {
    acceptedFiles,
    getRootProps,
    getInputProps,
    isFocused,
    isDragAccept,
    isDragReject,
  } = useDropzone();
  const [bulkEntries, setBulkEntries] = useState([]);
  const templateImage = useRef();
  const hiddenChooseFile = useRef();

  const files = acceptedFiles.map((file) => (
    <li key={file.path}>
      {file.path} - {file.size} bytes
    </li>
  ));

  const [isOwner, setIsOwner] = useState(false);

  const style = useMemo(
    () => ({
      ...baseStyle,
      ...(isFocused ? focusedStyle : {}),
      ...(isDragAccept ? acceptStyle : {}),
      ...(isDragReject ? rejectStyle : {}),
    }),
    [isFocused, isDragAccept, isDragReject]
  );

  const draw = (context, entry) => {
    var img = document.getElementById("templateImage");
    context.drawImage(img, 0, 0, 420, 594);
    context.font = "14px Arial";
    context.fillStyle = "black";
    context.fillText(entry.Name, 95, 176);
    context.fillText(entry.RegNum, 250, 176);
    context.fillText("VII", 350, 176);
    context.fillText(entry.CPI, 122, 543);
    context.fillText(entry.SPI, 305, 543);
  };

  const {
    getStaffMember,
    uploadFilesToIPFS,
    isOwnerAddress,
    uploadBulkDocuments,
  } = useCVPContext();
  const { checkIfWalletConnected, currentAccount } = useAuth();

  const downloadCanvasImage = () => {
    var canvases = document.getElementsByClassName("templateCanvas");
    console.log(canvases);

    Array.from(canvases).forEach((canvas) => {
      var url = canvas.toDataURL("image/png");
      var link = document.createElement("a");
      link.download = "filename.png";
      link.href = url;
      link.click();
    });
  };
  const [user, setUser] = useState([]);

  useEffect(() => {
    checkIfWalletConnected();
    console.log("Hello");
  }, []);

  const fetchStudent = useCallback(async () => {
    try {
      const staffMember = await getStaffMember();
      console.log(staffMember);
      const owner = await isOwnerAddress();
      setIsOwner(owner);
      setUser(staffMember);
      if (!owner && staffMember.department !== "Academic Section") {
        navigate("/admin");
      }
    } catch (err) {
      navigate("/register");
    }
  });

  useEffect(() => {
    console.log(currentAccount);
    if (currentAccount !== "") fetchStudent();
  }, [currentAccount]);

  const uploadRecord = useRef();
  const [docFileName, setDocFileName] = useState("");
  const [docFile, setDocFile] = useState("");

  const [emailId, setEmailId] = useState("");
  const [docName, setDocName] = useState("");
  const [description, setDescription] = useState("");

  const handleDocUpload = (e) => {
    e.preventDefault();
    uploadRecord.current.click();
  };

  const handleDocFileChange = (e) => {
    setDocFileName(e.target.files[0].name);
    setDocFile(e.target.files);
  };

  const convertPdfToImages = async (file, qrCode) => {
    const pdfDoc = await PDFDocument.create();

    PDFJS.GlobalWorkerOptions.workerSrc =
      "https://mozilla.github.io/pdf.js/build/pdf.worker.js";

    const images = [];
    const uri = URL.createObjectURL(file);
    const pdf = await PDFJS.getDocument({ url: uri }).promise;
    const canvas = document.createElement("canvas");

    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const viewport = page.getViewport({ scale: 1 });
      var context = canvas.getContext("2d");

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      if (i === 0) {
        context.drawImage(qrCode, 50, 50);
      }
      images.push(canvas.toDataURL("image/png"));
      const pngImage = await pdfDoc.embedPng(images[i]);

      const page1 = pdfDoc.addPage();
      page1.drawImage(pngImage);
    }
    const pdfBytes = await pdfDoc.save();

    return pdfBytes;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      emailId === "" ||
      docName === "" ||
      description === "" ||
      docFile === ""
    ) {
      toast.error("Enter all details first");
      return;
    } else {
      if (emailId.slice(-10) === "vjti.ac.in") {
        try {
          toast.warn("Please wait for a moment");
          const token = uuidv4();
          console.log(docFile[0]);
          const qrCode = await QRCode.toCanvas(
            `http://localhost:3000/verify/${token}`
          );

          const pdf = await convertPdfToImages(docFile[0], qrCode);
          console.log(pdf);

          const files = [new File([pdf], "Transcript.pdf")];

          const cid = await uploadFilesToIPFS(files);
          console.log(cid);

          await uploadBulkDocuments(
            [cid],
            docName,
            description,
            [emailId],
            ["Transcript.pdf"],
            currentAccount,
            [token]
          );
          toast.success("Transcript Uploaded");
        } catch (err) {
          toast.error("Some error occurred");
        }
      } else {
        toast.error("Please enter VJTI email address");
      }
    }
  };

  useEffect(() => {
    if (acceptedFiles.length > 0) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target.result;
        const workbook = xlsx.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(worksheet);
        setBulkEntries(json);
      };
      reader.readAsArrayBuffer(acceptedFiles[0]);
    }
  }, [acceptedFiles]);

  return (
    <>
      <ToastContainer />
      <div className={styles.marksheetUploadPageContainer}>
        <div className={styles.marksheetUploadPageBodyContainer}>
          <span className={styles.issueMarksheetHeader}>Issue Transcripts</span>
          {/* <div className={styles.issueMarksheetContainer}>
	const convertPdfToImages = async (file, qrCode) => {
		const pdfDoc = await PDFDocument.create();

		PDFJS.GlobalWorkerOptions.workerSrc =
			"https://mozilla.github.io/pdf.js/build/pdf.worker.js";

		const images = [];
		const uri = URL.createObjectURL(file);
		const pdf = await PDFJS.getDocument({ url: uri }).promise;
		const canvas = document.createElement("canvas");

		for (let i = 0; i < pdf.numPages; i++) {
			const page = await pdf.getPage(i + 1);
			const viewport = page.getViewport({ scale: 1 });
			var context = canvas.getContext("2d");

			canvas.height = viewport.height;
			canvas.width = viewport.width;
			await page.render({ canvasContext: context, viewport: viewport })
				.promise;
			if (i === 0) {
				context.drawImage(qrCode, 50, 50);
			}
			images.push(canvas.toDataURL("image/png"));
			const pngImage = await pdfDoc.embedPng(images[i]);

			const page1 = pdfDoc.addPage();
			page1.drawImage(pngImage);
		}
		const pdfBytes = await pdfDoc.save();

		return pdfBytes;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		const token = uuidv4();
		console.log(docFile[0]);
		const qrCode = await QRCode.toCanvas(
			`http://localhost:3000/verify/${token}`
		);

		const pdf = await convertPdfToImages(docFile[0], qrCode);
		console.log(pdf);

		const files = [new File([pdf], "Marksheet.pdf")];

		const cid = await uploadFilesToIPFS(files);
		console.log(cid);

		await uploadBulkDocuments(
			[cid],
			docName,
			description,
			[emailId],
			["Marksheet.pdf"],
			currentAccount,
			[token]
		);
	};

	useEffect(() => {
		if (acceptedFiles.length > 0) {
			const reader = new FileReader();
			reader.onload = (e) => {
				const data = e.target.result;
				const workbook = xlsx.read(data, { type: "array" });
				const sheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[sheetName];
				const json = xlsx.utils.sheet_to_json(worksheet);
				setBulkEntries(json);
			};
			reader.readAsArrayBuffer(acceptedFiles[0]);
		}
	}, [acceptedFiles]);

	return (
		<div className={styles.marksheetUploadPageContainer}>
			<div className={styles.marksheetUploadPageBodyContainer}>
				<span className={styles.issueMarksheetHeader}>
					Issue Transcripts
	</span>*/}
          <div className={styles.singleUploadSection}>
            <div className={styles.singleUploadForm}>
              <span className={styles.inputLabel}>Student Email Id</span>
              <input
                className={styles.regNumInput}
                type="email"
				name="email"
                value={emailId}
                placeholder="Email"
                onChange={(e) => setEmailId(e.target.value)}
              />
              <span className={styles.inputLabel}>Document name</span>
              <input
                className={styles.regNumInput}
                type="text"
                placeholder="Name"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
              />
              <span className={styles.inputLabel}>Document description</span>
              <input
                className={styles.regNumInput}
                type="text"
                value={description}
                placeholder="Description"
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className={styles.inputLabel}>Select Transcripts PDF</span>

              <div className={styles.fileUploadContainer}>
                <button
                  onClick={() => {
                    hiddenChooseFile.current.click();
                  }}
                  className={styles.chooseFileBtn}
                >
                  {docFileName === "" ? "Choose File" : docFileName}
                </button>
                <input
                  ref={hiddenChooseFile}
                  type="file"
                  id="formFile"
                  onChange={handleDocFileChange}
                  className={styles.chooseFileInput}
                />
              </div>
            </div>
            <button className={styles.issueDocBtn} onClick={handleSubmit}>
              <TaskAltIcon className={styles.tickIcon} /> Issue
            </button>
          </div>
        </div>

        <div className={styles.canvasContainer}>
          {bulkEntries.map((entry) => {
            // console.log(entry);
            return (
              <Canvas entry={entry} draw={draw} height={594} width={420} />
            );
          })}
          <img
            id="templateImage"
            className={styles.templateImage}
            height={594}
            width={420}
            src={template}
          />
        </div>
      </div>
    </>
  );
};

export default TranscriptsUploadPage;
