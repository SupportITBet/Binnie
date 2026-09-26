import React, { useState } from "react";
// import { FaExclamationTriangle } from "react-icons/fa";

export default function ConfirmDeleteModal({ isOpen, onClose, onConfirm, userName }) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    setIsConfirming(true);
    setTimeout(() => {
      onConfirm();
      setIsConfirming(false);
    }, 350);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          {/* <FaExclamationTriangle className="danger-icon" /> */}
          <h3>Confirmer la suppression</h3>
        </div>
        <div className="modal-body">
          <p>Voulez-vous vraiment supprimer <strong>{userName}</strong> ?</p>
          <p className="warning-text">Cette action est irréversible</p>
        </div>
        <div className="modal-buttons">
          <button className="btn-cancel" onClick={onClose} disabled={isConfirming}>
            Annuler
          </button>
          <button className="btn-confirm" onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming ? "Suppression..." : "Confirmer"}
          </button>
        </div>
      </div>

      <style jsx="true">{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.25s ease-in-out;
        }

        .modal-content {
          background: #fff;
          padding: 30px 25px;
          border-radius: 16px;
          max-width: 450px;
          width: 90%;
          text-align: center;
          box-shadow: 0 25px 50px rgba(0,0,0,0.2);
          animation: slideIn 0.3s ease-out;
          transition: transform 0.2s ease;
        }

        .modal-content:hover {
          transform: translateY(-2px);
        }

        .modal-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-header h3 {
          font-size: 1.5rem;
          color: #dc2626;
          margin-top: 10px;
          font-weight: 700;
        }

        .danger-icon {
          font-size: 3rem;
          color: #dc2626;
          animation: pulse 1.2s infinite, shake 0.6s ease-in-out infinite;
        }

        .modal-body p {
          font-size: 1rem;
          color: #111827;
          margin-bottom: 15px;
        }

        .warning-text {
          font-weight: 500;
          color: #b91c1c;
        }

        .modal-buttons {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 15px;
        }

        .btn-cancel, .btn-confirm {
          flex: 1;
          padding: 12px 0;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .btn-cancel {
          background: #f3f4f6;
          color: #374151;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .btn-cancel:hover {
          background: #e5e7eb;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .btn-confirm {
          background: linear-gradient(90deg, #f87171, #dc2626);
          color: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .btn-confirm:hover {
          background: linear-gradient(90deg, #dc2626, #b91c1c);
          transform: translateY(-2px);
          box-shadow: 0 6px 15px rgba(0,0,0,0.2);
        }

        .btn-confirm:active {
          transform: scale(0.97);
        }

        .btn-cancel:disabled, .btn-confirm:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          50% { transform: translateX(4px); }
          75% { transform: translateX(-4px); }
        }
      `}</style>
    </div>
  );
}