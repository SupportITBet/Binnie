import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import Navbar from "./Navbar";  
import Footer from "./Footer";  

const backend = "http://localhost:8000";
// const backend = "https://backend-codeshop225.onrender.com"

export default function Affiches() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState({ text: "", expiresAt: "" });
  const [editingMessage, setEditingMessage] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // 🔹 loader ajout

  // 🔹 Charger les messages existants
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await axios.get(`${backend}/get/messages`);
        setMessages(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Erreur lors du chargement des messages.");
      }
    };
    fetchMessages();
  }, []);

  // 🔹 Ajouter un nouveau message
  const handleAddMessage = async () => {
    if (!newMessage.text || !newMessage.expiresAt) {
      toast.error("Veuillez remplir le message et la date d'expiration.");
      return;
    }
    try {
      setIsLoading(true); // 🔹 début loader
      const res = await axios.post(`${backend}/new/messages`, newMessage);
      setMessages([...messages, res.data]);
      setNewMessage({ text: "", expiresAt: "" });
      toast.success("Message ajouté !");
    } catch (err) {
      console.error(err);
      toast.error("Erreur ajout message.");
    } finally {
      setIsLoading(false); // 🔹 fin loader
    }
  };

  // 🔹 Supprimer un message
  const handleDeleteMessage = async (id) => {
    try {
      await axios.delete(`${backend}/delete/messages/${id}`);
      setMessages(messages.filter(m => m._id !== id));
      toast.success("Message supprimé !");
    } catch (err) {
      console.error(err);
      toast.error("Erreur suppression message.");
    }
  };

  // 🔹 Préparer le modal pour l’édition
  const handleEditClick = (message) => {
    setEditingMessage({ ...message });
    setShowEditModal(true);
  };

  // 🔹 Mettre à jour un message
  const handleUpdateMessage = async () => {
    if (!editingMessage.text || !editingMessage.expiresAt) {
      toast.error("Veuillez remplir le message et la date d'expiration.");
      return;
    }
    try {
      const res = await axios.put(`${backend}/update/messages/${editingMessage._id}`, editingMessage);
      setMessages(messages.map(m => (m._id === editingMessage._id ? res.data : m)));
      setEditingMessage(null);
      setShowEditModal(false);
      toast.success("Message mis à jour !");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la mise à jour.");
    }
  };

  return (
    <>
      <Navbar />
<div className="dashboard-wrapper">

      <div style={{ padding: 20, maxWidth: 800, margin: "auto" }}>
        <h2>Gestion Messages</h2>

        {/* 🔹 Formulaire ajout */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <input
            placeholder="Message"
            value={newMessage.text}
            onChange={e => setNewMessage({ ...newMessage, text: e.target.value })}
          />
          <input
            type="date"
            value={newMessage.expiresAt}
            onChange={e => setNewMessage({ ...newMessage, expiresAt: e.target.value })}
          />
          <button onClick={handleAddMessage} disabled={isLoading} style={{ position: 'relative' }}>
            {isLoading ? "Envoi..." : "Ajouter Message"}
          </button>
        </div>

        {/* 🔹 Liste des messages */}
        <ul>
          {messages.map(m => (
            <li key={m._id} style={{ marginBottom: 5 }}>
              {m.text} - Exp: {new Date(m.expiresAt).toLocaleDateString()}
              <button 
                onClick={() => handleEditClick(m)} 
                style={{ marginLeft: 10 }}
              >
                Modifier
              </button>
              <button 
                onClick={() => handleDeleteMessage(m._id)} 
                style={{ marginLeft: 5, backgroundColor: "#dc2626", color: "white" }}
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 🔹 Modal d’édition */}
      {showEditModal && editingMessage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'white', padding: 20, borderRadius: 10, minWidth: 300
          }}>
            <h3>Modifier le message</h3>
            <input
              value={editingMessage.text}
              onChange={e => setEditingMessage({ ...editingMessage, text: e.target.value })}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <input
              type="date"
              value={editingMessage.expiresAt.split('T')[0]}
              onChange={e => setEditingMessage({ ...editingMessage, expiresAt: e.target.value })}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setShowEditModal(false)}>Annuler</button>
              <button onClick={handleUpdateMessage}>Mettre à jour</button>
            </div>
          </div>
        </div>
      )}
</div>

      <Footer />
    </>
  );
}