import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserContext } from '../contexts/UserContext';
import Navbar from './Navbar/Navbar';
import Footer from './Footer';
import toast from 'react-hot-toast';
import { Blocks } from 'react-loader-spinner';

const backend = 'https://backend-codeshop225.onrender.com'; // à remplacer par l'URL de production

export default function Newsletter() {
  const { user, logout } = useUserContext();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState(null);

  const logoutHandler = () => {
    logout();
  };

  const fetchEmails = async () => {
    try {
      const res = await fetch(`${backend}/newsletter?adminId=${user._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erreur lors du chargement');
      setEmails(data);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors du chargement des emails.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    fetchEmails();
  }, [user, navigate]);

  const confirmDelete = (id) => {
    setEmailToDelete(id);
    setShowModal(true);
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`${backend}/newsletter/${emailToDelete}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erreur lors de la suppression');

      setEmails(emails.filter(email => email._id !== emailToDelete));
      toast.success("Email supprimé avec succès !");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la suppression.");
    } finally {
      setShowModal(false);
      setEmailToDelete(null);
    }
  };

  return (
    <>
      <Navbar logoutHandler={logoutHandler} />

      <div className="dashboard-wrapper">
        <div className="content animate-fadein">
          <h1>📬 Emails Newsletter</h1>

          {loading ? (
            <div className="loader">
              <Blocks visible={true} height="80" width="100" />
            </div>
          ) : (
            <div className="table-container animate-scalein">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Email</th>
                    <th>Date d’inscription</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.length === 0 ? (
                    <tr>
                      <td colSpan="4">Aucun abonné pour le moment.</td>
                    </tr>
                  ) : (
                    emails.map((e, i) => (
                      <tr key={e._id}>
                        <td>{i + 1}</td>
                        <td>{e.email}</td>
                        <td>{new Date(e.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td>
                          <button
                            onClick={() => confirmDelete(e._id)}
                            className="btn btn-danger"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmation */}
      {showModal && (
        <div className="modal-overlayNews">
          <div className="modalNews">
            <h2>Confirmer la suppression</h2>
            <p>Êtes-vous sûr de vouloir supprimer cet email ?</p>
            <div className="modal-actions">
              <button onClick={() => setShowModal(false)} className="btn btn-secondary">Annuler</button>
              <button onClick={handleDelete} className="btn btn-danger">Confirmer</button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}