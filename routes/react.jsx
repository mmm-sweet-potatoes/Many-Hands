import React, { useState } from 'react';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'leaderboard' | 'account'
  const [selectedPost, setSelectedPost] = useState(null); // Overcasting Modal State

  // Logged-in User Account State
  const [user, setUser] = useState({
    name: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    points: 85,
    completedCleanups: 2,
    rank: 3
  });

  // Leaderboard Data
  const [leaderboard, setLeaderboard] = useState([
    { id: 1, name: 'Sarah Jenkins', points: 210, verifiedJobs: 6, avatar: '🌿' },
    { id: 2, name: 'Marcus Chen', points: 145, verifiedJobs: 4, avatar: '🌲' },
    { id: 3, name: 'Alex Rivera (You)', points: 85, verifiedJobs: 2, avatar: '🌱' },
    { id: 4, name: 'Elena Rostova', points: 42, verifiedJobs: 1, avatar: '🍃' },
  ]);

  // Master Posts State
  const [posts, setPosts] = useState([
    {
      id: 1,
      location: "Pinewood Trailhead & Picnic Area",
      priority: "High",
      date: "Aug 21, 2026",
      author: "Elena_R",
      isCompleted: false,
      images: [
        "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Overflowing recycling bins and scattered cardboard near the main trail entry.",
      submissions: [
        {
          id: 101,
          author: "Alex Rivera",
          description: "Bagged up all loose plastics and reset the recycling bin area thoroughly.",
          images: [
            "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&auto=format&fit=crop&q=80"
          ],
          completeVotes: 28,
          incompleteVotes: 2,
          userVote: null // 'complete' | 'incomplete' | null
        }
      ]
    },
    {
      id: 2,
      location: "Glasshouse Plaza Fountain",
      priority: "Medium",
      date: "Aug 20, 2026",
      author: "Marcus_Dev",
      isCompleted: true,
      images: [
        "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Litter scattered around the architectural seating blocks.",
      submissions: [
        {
          id: 102,
          author: "Sarah Jenkins",
          description: "Swept plaza steps and disposed of all trash in municipal bins.",
          images: [
            "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=80"
          ],
          completeVotes: 34,
          incompleteVotes: 4,
          userVote: null
        }
      ]
    }
  ]);

  // Form states for creating post and submitting proof
  const [newPost, setNewPost] = useState({ location: '', priority: 'Low', description: '', images: [] });
  const [newSubmission, setNewSubmission] = useState({ description: '', images: [] });
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Voting Rule Engine: Check if a submission satisfies completion criteria
  // Criteria: complete >= 30, incomplete < 10, complete:incomplete ratio >= 3:1
  const checkCompletionCriteria = (complete, incomplete) => {
    if (complete < 30 || incomplete >= 10) return false;
    const ratio = incomplete === 0 ? complete : complete / incomplete;
    return ratio >= 3;
  };

  // Vote on a Cleanup Proof Submission
  const handleSubmissionVote = (postId, subId, voteType) => {
    setPosts(prevPosts => prevPosts.map(post => {
      if (post.id !== postId) return post;

      let newlyCompleted = post.isCompleted;

      const updatedSubmissions = post.submissions.map(sub => {
        if (sub.id !== subId) return sub;

        let comp = sub.completeVotes;
        let incomp = sub.incompleteVotes;
        let prevVote = sub.userVote;

        if (prevVote === voteType) {
          // Undo vote
          if (voteType === 'complete') comp--;
          else incomp--;
          prevVote = null;
        } else {
          // Apply new vote
          if (prevVote === 'complete') comp--;
          if (prevVote === 'incomplete') incomp--;

          if (voteType === 'complete') comp++;
          if (voteType === 'incomplete') incomp++;
          prevVote = voteType;
        }

        // Check verification threshold
        const meetsCriteria = checkCompletionCriteria(comp, incomp);
        if (meetsCriteria && !post.isCompleted) {
          newlyCompleted = true;
          awardPoints(sub.author, comp);
        }

        return { ...sub, completeVotes: comp, incompleteVotes: incomp, userVote: prevVote };
      });

      const updatedPost = { ...post, isCompleted: newlyCompleted, submissions: updatedSubmissions };
      if (selectedPost && selectedPost.id === postId) setSelectedPost(updatedPost);
      return updatedPost;
    }));
  };

  // Points Distributor Logic
  const awardPoints = (authorName, pointsAmount) => {
    if (authorName.includes("You") || authorName === user.name) {
      setUser(prev => ({
        ...prev,
        points: prev.points + pointsAmount,
        completedCleanups: prev.completedCleanups + 1
      }));
    }
    setLeaderboard(prev => prev.map(item => 
      item.name === authorName ? { ...item, points: item.points + pointsAmount } : item
    ).sort((a, b) => b.points - a.points));
  };

  // Add New Post Request
  const handleCreatePost = (e) => {
    e.preventDefault();
    if (!newPost.location || !newPost.description) return;

    const created = {
      id: Date.now(),
      location: newPost.location,
      priority: newPost.priority,
      date: "Just now",
      author: user.name,
      isCompleted: false,
      images: newPost.images.length > 0 ? newPost.images : ["https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=600&auto=format&fit=crop&q=80"],
      description: newPost.description,
      submissions: []
    };

    setPosts([created, ...posts]);
    setNewPost({ location: '', priority: 'Low', description: '', images: [] });
    setIsFormOpen(false);
  };

  // Add Proof Submission to a Post
  const handleAddSubmission = (e) => {
    e.preventDefault();
    if (!newSubmission.description || !selectedPost) return;

    const sub = {
      id: Date.now(),
      author: `${user.name} (You)`,
      description: newSubmission.description,
      images: newSubmission.images.length > 0 ? newSubmission.images : ["https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&auto=format&fit=crop&q=80"],
      completeVotes: 1,
      incompleteVotes: 0,
      userVote: 'complete'
    };

    const updatedPost = { ...selectedPost, submissions: [sub, ...selectedPost.submissions] };
    setPosts(posts.map(p => p.id === selectedPost.id ? updatedPost : p));
    setSelectedPost(updatedPost);
    setNewSubmission({ description: '', images: [] });
  };

  // Multiple Image Input Handler
  const handleImageUpload = (e, targetSetter) => {
    const files = Array.from(e.target.files);
    const urls = files.slice(0, 5).map(file => URL.createObjectURL(file));
    targetSetter(prev => ({ ...prev, images: [...prev.images, ...urls].slice(0, 5) }));
  };

  return (
    <div className="app-shell">
      {/* Navbar with Tab Switcher */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-brand" onClick={() => setActiveTab('feed')}>
            <span className="logo-leaf">🌿</span> Many Hands
          </div>
          <div className="nav-tabs">
            <button className={`nav-tab ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>Feed</button>
            <button className={`nav-tab ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>Leaderboard</button>
            <button className={`nav-tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>Account ({user.points} pts)</button>
          </div>
        </div>
      </nav>

      <main className="main-layout">
        
        {/* TAB 1: COMMUNITY FEED */}
        {activeTab === 'feed' && (
          <>
            {/* Expandable Request Form */}
            <section className="create-post-trigger-wrapper">
              <button className="trigger-banner" onClick={() => setIsFormOpen(!isFormOpen)}>
                <div className="trigger-text">
                  <span className="trigger-icon">🌱</span>
                  <div>
                    <h3>See something out of place?</h3>
                    <p>Share a clean-up request with the community</p>
                  </div>
                </div>
                <span className="expand-arrow">{isFormOpen ? '▲ Close' : '▼ Make Request'}</span>
              </button>

              {isFormOpen && (
                <form className="expandable-form" onSubmit={handleCreatePost}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Location</label>
                      <input type="text" placeholder="e.g. Pine Street Park bench area" value={newPost.location} onChange={e => setNewPost({...newPost, location: e.target.value})} required />
                    </div>
                    <div className="form-group">
                      <label>Priority</label>
                      <select value={newPost.priority} onChange={e => setNewPost({...newPost, priority: e.target.value})}>
                        <option value="Low">Low Priority</option>
                        <option value="Medium">Medium Priority</option>
                        <option value="High">High Priority</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea rows="2" placeholder="Describe the problem..." value={newPost.description} onChange={e => setNewPost({...newPost, description: e.target.value})} required></textarea>
                  </div>
                  <div className="form-group">
                    <label>Photos (Up to 5)</label>
                    <input type="file" multiple accept="image/*" onChange={e => handleImageUpload(e, setNewPost)} />
                    <div className="horizontal-gallery preview-gallery">
                      {newPost.images.map((img, i) => <img key={i} src={img} alt="preview" className="gallery-thumb" />)}
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary">Publish Clean-Up Request</button>
                </form>
              )}
            </section>

            {/* Posts Feed Grid */}
            <section className="feed-container">
              <h2>Community Clean-Up Board</h2>
              <div className="feed-grid">
                {posts.map(post => (
                  <article key={post.id} className="post-card" onClick={() => setSelectedPost(post)}>
                    <div className="post-image-container">
                      <img src={post.images[0]} alt={post.location} className="post-image" />
                      <span className={`status-pill ${post.isCompleted ? 'status-completed' : `status-${post.priority.toLowerCase()}`}`}>
                        {post.isCompleted ? '✓ Completed' : `${post.priority} Priority`}
                      </span>
                    </div>
                    <div className="post-body">
                      <div className="post-meta">Posted by {post.author} • {post.date}</div>
                      <h3>{post.location}</h3>
                      <p className="post-description">{post.description}</p>
                      <div className="post-footer-hint">
                        <span>📷 {post.images.length} Photos</span>
                        <span className="open-detail-link">View Details & Work Proof →</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {/* TAB 2: LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <section className="leaderboard-section">
            <h2>Community Cleaners Leaderboard</h2>
            <p className="subtitle">Earn points when your submitted work receives 30+ Complete votes!</p>
            <div className="leaderboard-list">
              {leaderboard.map((cleaner, index) => (
                <div key={cleaner.id} className={`leaderboard-card ${cleaner.name.includes('You') ? 'highlight-user' : ''}`}>
                  <div className="rank">#{index + 1}</div>
                  <div className="avatar">{cleaner.avatar}</div>
                  <div className="cleaner-info">
                    <h4>{cleaner.name}</h4>
                    <span>{cleaner.verifiedJobs} Cleanups Completed</span>
                  </div>
                  <div className="points-badge">{cleaner.points} Points</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: ACCOUNT & SETTINGS */}
        {activeTab === 'account' && (
          <section className="account-section">
            <h2>My Account & Scoreboard</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Points</h3>
                <p className="stat-value">{user.points}</p>
              </div>
              <div className="stat-card">
                <h3>Verified Cleanups</h3>
                <p className="stat-value">{user.completedCleanups}</p>
              </div>
              <div className="stat-card">
                <h3>Current Rank</h3>
                <p className="stat-value">#{user.rank}</p>
              </div>
            </div>

            <div className="account-card">
              <h3>Account Details</h3>
              <form onSubmit={e => { e.preventDefault(); alert('Profile updated!'); }} className="account-form">
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" value={user.email} onChange={e => setUser({...user, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Change Password</label>
                  <input type="password" placeholder="••••••••" />
                </div>
                <button type="submit" className="btn btn-primary">Save Profile Changes</button>
              </form>
            </div>
          </section>
        )}

      </main>

      {/* OVERCASTING DETAIL MODAL */}
      {selectedPost && (
        <div className="modal-overlay" onClick={() => setSelectedPost(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPost(null)}>✕</button>
            
            <div className="modal-header">
              <span className={`status-pill ${selectedPost.isCompleted ? 'status-completed' : `status-${selectedPost.priority.toLowerCase()}`}`}>
                {selectedPost.isCompleted ? '✓ Job Complete' : `${selectedPost.priority} Priority`}
              </span>
              <h2>{selectedPost.location}</h2>
              <p>Requested by <strong>{selectedPost.author}</strong> on {selectedPost.date}</p>
            </div>

            {/* Horizontal Scrollable Gallery of Initial Request */}
            <div className="modal-section">
              <h4>Request Gallery (Scroll horizontal)</h4>
              <div className="horizontal-gallery">
                {selectedPost.images.map((img, i) => (
                  <img key={i} src={img} alt="Clean up site" className="gallery-image" />
                ))}
              </div>
            </div>

            <p className="modal-description">{selectedPost.description}</p>

            <hr className="divider" />

            {/* Work Proof Submissions Section */}
            <div className="modal-section">
              <h3>Community Work Proof Submissions</h3>
              <p className="subtext">Requires 30+ Green votes, &lt;10 Red votes, &amp; 3:1 ratio to declare job complete.</p>

              {/* Submit Proof Form */}
              <form onSubmit={handleAddSubmission} className="submission-form">
                <h4>Submit Your Completed Clean-Up Proof</h4>
                <textarea rows="2" placeholder="Describe the work you completed..." value={newSubmission.description} onChange={e => setNewSubmission({...newSubmission, description: e.target.value})} required></textarea>
                <input type="file" multiple accept="image/*" onChange={e => handleImageUpload(e, setNewSubmission)} />
                <button type="submit" className="btn btn-secondary btn-sm">Upload Proof Submission</button>
              </form>

              {/* Existing Submissions List */}
              <div className="submissions-list">
                {selectedPost.submissions.length === 0 ? (
                  <p className="empty-notice">No clean-up proof submitted yet. Be the first to clean this area!</p>
                ) : (
                  selectedPost.submissions.map(sub => {
                    const isVerified = checkCompletionCriteria(sub.completeVotes, sub.incompleteVotes);
                    return (
                      <div key={sub.id} className={`submission-card ${isVerified ? 'submission-verified' : ''}`}>
                        <div className="sub-header">
                          <strong>{sub.author}</strong>
                          {isVerified && <span className="verified-tag">✓ Community Verified (30+ Votes)</span>}
                        </div>
                        <p>{sub.description}</p>
                        
                        <div className="horizontal-gallery mini-gallery">
                          {sub.images.map((img, idx) => (
                            <img key={idx} src={img} alt="Proof" className="gallery-thumb" />
                          ))}
                        </div>

                        {/* Complete (Green) / Incomplete (Red) Accented Voting Buttons */}
                        <div className="vote-actions">
                          <button 
                            className={`btn-accent-vote btn-complete ${sub.userVote === 'complete' ? 'active' : ''}`}
                            onClick={() => handleSubmissionVote(selectedPost.id, sub.id, 'complete')}
                          >
                            ✓ Complete ({sub.completeVotes})
                          </button>
                          
                          <button 
                            className={`btn-accent-vote btn-incomplete ${sub.userVote === 'incomplete' ? 'active' : ''}`}
                            onClick={() => handleSubmissionVote(selectedPost.id, sub.id, 'incomplete')}
                          >
                            ✕ Incomplete ({sub.incompleteVotes})
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}