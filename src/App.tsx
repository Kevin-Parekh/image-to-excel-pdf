import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Camera, 
  Table as TableIcon, 
  FileSpreadsheet, 
  FileText, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Download,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from "@google/genai";

// Types
interface TableData {
  headers: string[];
  rows: string[][];
}

export default function App() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // --- Image Handling ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setStep(1);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/png');
        setImage(dataUrl);
        stopCamera();
      }
    }
  };

  // --- AI Processing ---

  const processImage = async () => {
    if (!image) return;
    
    setIsProcessing(true);
    setError(null);
    setStep(2);

    try {
      const base64Data = image.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: "Extract the tabular data from this image. Return the data as a JSON object with a 'headers' array and a 'rows' array (where each row is an array of strings). If there are multiple tables, extract the main one. Ensure all cells are captured accurately. Return ONLY the JSON object, no markdown formatting."
              },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const resultText = response.text;
      if (!resultText) throw new Error("No data extracted from image.");
      
      const parsedData = JSON.parse(resultText) as TableData;
      
      // Basic validation/cleanup
      if (!parsedData.headers || !parsedData.rows) {
        throw new Error("Invalid data format received from AI.");
      }

      setTableData(parsedData);
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing the image.");
      setStep(1);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Table Editing ---

  const updateHeader = (index: number, value: string) => {
    if (!tableData) return;
    const newHeaders = [...tableData.headers];
    newHeaders[index] = value;
    setTableData({ ...tableData, headers: newHeaders });
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    if (!tableData) return;
    const newRows = [...tableData.rows];
    newRows[rowIndex][colIndex] = value;
    setTableData({ ...tableData, rows: newRows });
  };

  const addRow = () => {
    if (!tableData) return;
    const newRow = new Array(tableData.headers.length).fill("");
    setTableData({ ...tableData, rows: [...tableData.rows, newRow] });
  };

  const deleteRow = (index: number) => {
    if (!tableData) return;
    const newRows = tableData.rows.filter((_, i) => i !== index);
    setTableData({ ...tableData, rows: newRows });
  };

  const addColumn = () => {
    if (!tableData) return;
    setTableData({
      headers: [...tableData.headers, `New Column ${tableData.headers.length + 1}`],
      rows: tableData.rows.map(row => [...row, ""])
    });
  };

  // --- Exporting ---

  const exportToExcel = () => {
    if (!tableData) return;
    
    const wsData = [tableData.headers, ...tableData.rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extracted Data");
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `extracted_table_${timestamp}.xlsx`);
  };

  const printToPDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <TableIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">SmartTable AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm font-medium text-gray-500">
              <span className={step >= 1 ? 'text-indigo-600' : ''}>1. Upload</span>
              <ChevronRight className="w-4 h-4" />
              <span className={step >= 2 ? 'text-indigo-600' : ''}>2. Process</span>
              <ChevronRight className="w-4 h-4" />
              <span className={step >= 3 ? 'text-indigo-600' : ''}>3. Export</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* Step 1: Upload / Capture */}
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <div className="text-center mb-10">
                <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
                  Convert Images to Structured Data
                </h2>
                <p className="mt-4 text-lg text-gray-500">
                  Upload a photo of a table, invoice, or form and let our AI handle the rest.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Upload Card */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all duration-300"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                  <div className="bg-indigo-50 p-4 rounded-full group-hover:bg-indigo-100 transition-colors">
                    <Upload className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">Upload Image</h3>
                  <p className="mt-2 text-sm text-gray-500 text-center">
                    Drag and drop or click to browse files (PNG, JPG, WEBP)
                  </p>
                </div>

                {/* Camera Card */}
                <div 
                  onClick={startCamera}
                  className="group relative bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all duration-300"
                >
                  <div className="bg-indigo-50 p-4 rounded-full group-hover:bg-indigo-100 transition-colors">
                    <Camera className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">Capture Photo</h3>
                  <p className="mt-2 text-sm text-gray-500 text-center">
                    Use your device's camera to take a photo of the document
                  </p>
                </div>
              </div>

              {/* Preview & Process Button */}
              {image && !cameraActive && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-12 bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200"
                >
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Image Preview</span>
                    <button 
                      onClick={() => setImage(null)}
                      className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                  <div className="aspect-video bg-gray-50 flex items-center justify-center p-4">
                    <img src={image} alt="Preview" className="max-h-full rounded-lg shadow-sm" />
                  </div>
                  <div className="p-6 bg-gray-50">
                    <button 
                      onClick={processImage}
                      className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                      Process with AI
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}

              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Camera Modal Overlay */}
          {cameraActive && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
              <div className="relative w-full max-w-2xl aspect-[3/4] md:aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6 px-4">
                  <button 
                    onClick={stopCamera}
                    className="bg-white/20 backdrop-blur-md text-white p-4 rounded-full hover:bg-white/30 transition-colors"
                  >
                    <X className="w-8 h-8" />
                  </button>
                  <button 
                    onClick={capturePhoto}
                    className="bg-white p-1 rounded-full shadow-xl active:scale-95 transition-transform"
                  >
                    <div className="w-16 h-16 rounded-full border-4 border-gray-100 flex items-center justify-center">
                      <div className="w-12 h-12 bg-indigo-600 rounded-full" />
                    </div>
                  </button>
                </div>
              </div>
              <p className="mt-6 text-white/60 text-sm font-medium">Align the table within the frame for best results</p>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {/* Step 2: Processing */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="relative">
                <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-pulse" />
                </div>
              </div>
              <h3 className="mt-8 text-2xl font-bold text-gray-900">Analyzing Document...</h3>
              <p className="mt-2 text-gray-500 max-w-md text-center">
                Our AI is identifying rows, columns, and cell data. This usually takes just a few seconds.
              </p>
              <div className="mt-10 w-full max-w-xs bg-gray-100 rounded-full h-2 overflow-hidden">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 5, ease: "linear" }}
                  className="h-full bg-indigo-600"
                />
              </div>
            </motion.div>
          )}

          {/* Step 3: Table Result */}
          {step === 3 && tableData && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    Extraction Complete
                  </h2>
                  <p className="text-gray-500 text-sm mt-1">Review and edit the data before exporting.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setStep(1)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Start Over
                  </button>
                  <button 
                    onClick={exportToExcel}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Export Excel
                  </button>
                  <button 
                    onClick={printToPDF}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <FileText className="w-4 h-4" />
                    Print PDF
                  </button>
                </div>
              </div>

              {/* Editable Table Container */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {tableData.headers.map((header, i) => (
                            <th key={i} className="p-4">
                              <input 
                                type="text"
                                value={header}
                                onChange={(e) => updateHeader(i, e.target.value)}
                                className="table-input font-bold text-gray-700"
                              />
                            </th>
                        ))}
                        <th className="w-12 p-4 print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
                          {row.map((cell, colIndex) => (
                            <td key={colIndex} className="p-4">
                              <input 
                                type="text"
                                value={cell}
                                onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                                className="table-input text-gray-600"
                              />
                            </td>
                          ))}
                          <td className="p-4 text-right print:hidden">
                            <button 
                              onClick={() => deleteRow(rowIndex)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center gap-4 print:hidden">
                  <button 
                    onClick={addRow}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add Row
                  </button>
                  <button 
                    onClick={addColumn}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add Column
                  </button>
                </div>
              </div>

              {/* Print Only View Info */}
              <div className="hidden print:block mt-8 text-center text-gray-400 text-xs">
                Generated by SmartTable AI • {new Date().toLocaleDateString()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-12 border-t border-gray-200 bg-white print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500 text-sm">
            Powered by Gemini Vision AI. Accuracy may vary based on image quality.
          </p>
        </div>
      </footer>

      {/* Global Print Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white; }
          main { padding: 0; }
          .max-w-7xl { max-width: none; width: 100%; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; }
          input { border: none !important; ring: none !important; }
        }
      `}} />
    </div>
  );
}
