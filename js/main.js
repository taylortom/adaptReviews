var AT_CORE_REVIEWERS = [
  'lc-thomasberger',
  'tomgreenfield',
  'brian-learningpool',
  'taylortom',
  'dancgray',
  'canstudios-nicolaw'
];
var FW_CORE_REVIEWERS = [
  'moloko',
  'brian-learningpool',
  'cajones',
  'chris-steele',
  'dancgray',
  'danielghost',
  'dennis-learningpool',
  'lc-thomasberger',
  'oliverfoster',
  'taylortom',
  'tomgreenfield',
  'zenduo'
];
// set to one of the above based on repo
var CORE_REVIEWERS;

$(function() {
  getGHData('orgs/adaptlearning/repos', function(repos) {
    $('body').show();
    renderRepoSelect(repos);
  });
});

/**
* Data manipulation
*/

function getGHData(urlSuffix, data, dataType, callback) {
  if(typeof data === 'function') {
    callback = data;
    data = undefined;
    dataType = undefined;
  }
  // TODO oauth2
  $.ajax({
    url: 'https://api.github.com/' + urlSuffix,
    type: 'GET',
    data: _.extend({ per_page: 50 }, data),
    dataType: dataType,
    headers: {
      Authorization: 'token 15e160298d59a7a70ac7895c9766b0802735ac99'
    },
    success: callback,
    error: function(jqXHR) {
      if(jqXHR.responseJSON) {
        console.log(jqXHR.responseJSON.message + '\n' + jqXHR.responseJSON.documentation_url);
      }
      else if(jqXHR.statusText) {
        console.log(jqXHR.statusText);
      }
      console.log(jqXHR);
    }
  });
}

function getRepoData(repo, callback) {
  getGHData('repos/adaptlearning/' + repo + '/pulls', function(prs) {
    if(prs.length === 0) {
      return callback.call(this, []);
    }
    var done = 0;
    for(var i = 0, count = prs.length; i < count; i++) {
      getReviewDataLoop(prs, i, function() {
        done++;
        if(done === prs.length) {
          callback.call(this, prs.sort(sortPRs));
        }
      });
    }
  });
}

function getReviewDataLoop(prs, index, callback) {
  var i = Number(index);
  var pr = prs[i];
  getReviews(pr.base.repo.name, pr.number, function(reviews) {
    if(reviews.length > 0) pr.reviews = organiseReviews(reviews);
    callback.call(this);
  });
}

function getReviews(repo, pr, callback) {
  $.ajax({
    url: 'https://api.github.com/repos/adaptlearning/' + repo + '/pulls/' + pr + '/reviews',
    type: 'GET',
    headers: {
      Accept : "application/vnd.github.black-cat-preview+json",
      Authorization: 'token 15e160298d59a7a70ac7895c9766b0802735ac99'
    },
    success: callback,
    error: console.log
  });
}

function organiseReviews(reviews) {
  if(reviews.length === 0) {
    return;
  }
  var users = [];
  var data = {
    approved: [],
    rejected: [],
    commented: []
  }
  for(var i = reviews.length-1; i >= 0; i--) {
    var review = reviews[i];
    // TODO ignore if review user is same as PR user
    // only take into account the core team
    if(!_.contains(CORE_REVIEWERS, review.user.login)) {
      console.log(review.user.login, 'is not a core reviewer');
      continue;
    }
    // only get latest review from a user
    if(_.contains(users, review.user.login)) {
      continue;
    }
    if(review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      users.push(review.user.login);
    }
    if(review.state === 'APPROVED') data.approved.push(review.user.login);
    if(review.state === 'COMMENTED') data.commented.push(review.user.login);
    if(review.state === 'CHANGES_REQUESTED') data.rejected.push(review.user.login);
  }
  if(data.approved.length === 0 && data.rejected.length === 0 && data.commented.length === 0) {
    return;
  }
  return data;
}
function sortPRs(a, b) {
  if(!a.reviews && !b.reviews) {
    return 0;
  }
  if(!a.reviews) {
    return 1;
  }
  if(!b.reviews) {
    return -1;
  }
  if(a.reviews.rejected.length > b.reviews.rejected.length) {
    return -1;
  }
  if(a.reviews.rejected.length < b.reviews.rejected.length) {
    return 1;
  }
  if(a.reviews.approved.length > b.reviews.approved.length) {
    return -1;
  }
  if(a.reviews.approved.length < b.reviews.approved.length) {
    return 1;
  }
  return 0;
}

/**
* Rendering
*/

function renderRepoSelect(repos) {
  repos.sort(function(a, b) {
    if(a.name > b.name) return 1;
    if(a.name < b.name) return -1;
    return 0;
  });
  var htmlString = '<option disabled selected>Select a repository</option>';
  for(var i = 0, count = repos.length; i < count; i++) {
    htmlString += '<option value="' + repos[i].name + '">' + repos[i].name + '</option>'
  }
  $('.select')
    .append('<span class="repo-label">Repository:</span>')
    .append('<select id="repoSelect"></select>');

  $('#repoSelect').append(htmlString)
    .change(onSelectChanged);

  $('#repoSelect').val('adapt_authoring');
  onSelectChanged({ currentTarget: $('#repoSelect') });
}

function renderPRsForRepo(repoData) {
  var $inner = $('.inner')
    .empty();

  if(repoData.length === 0) {
    $inner.append('<div style="margin:50px 0 50px 0;text-align: center;opacity:0.5;">No pull requests found.</div>');
  } else {
    $inner.append('<div class="prs"></div>');
    for(var i = 0, count = repoData.length; i < count; i++) renderPR(repoData[i]);
  }
}

function renderPR(pr) {
  var template = getPRTemplate(pr);
  var $pr = $(template(pr));

  $pr.click(function() {
    window.open(pr.html_url);
  });

  if(!pr.reviews) {
    $pr.addClass('no-reviews');
  } else {
    // to show number of +1s
    var icons = ' ';
    for(var i = 0, count = pr.reviews.approved.length; i < count; i++)
      icons += '<span class="approved">&#10004;</span>';
    for(var i = 0, count = pr.reviews.rejected.length; i < count; i++)
      icons += '<span class="rejected">&#10005;</span>';

    $('.title', $pr).append(icons);

    if(pr.reviews.approved.length === 3) $pr.addClass('approved');
    if(pr.reviews.rejected.length > 0) $pr.addClass('rejected');
    if(pr.reviews.commented.length > 0) $pr.addClass('commented');
  }

  $('.prs').append($pr);
}

function getPRTemplate(pr) {
  return _.template(
    '<div class="pr <%- number%>">' +
      '<div class="inner">' +
        '<div class="title">#<%- number %>: <%- title %> <div class="author">by <span class="author"><%- user.login%></span></div></div>' +
        '<div class="body"><%- body %></div>' +
        getReviewHTMLForPR(pr) +
      '</div>' +
    '</div>'
  );
}

function getReviewHTMLForPR(pr) {
  var htmlString = '';
  if(pr.reviews) {
    htmlString += '<div class="reviews">';
    if(pr.reviews.approved.length > 0) {
      htmlString += '<div><b class="approved">Approved by</b>: ' + pr.reviews.approved.join(', ') + '</div>';
    }
    if(pr.reviews.rejected.length > 0) {
      htmlString += '<div><b class="rejected">Rejected by</b>: ' + pr.reviews.rejected.join(', ') + '</div>';
    }
    if(pr.reviews.commented.length > 0) {
      htmlString += '<div><b class="commented">Comments</b>: ' + pr.reviews.commented.join(', ') + '</div>';
    }
    htmlString += '</div>';
  }
  return htmlString;
}

/**
* Events
*/

function onSelectChanged(event) {
  var repo = $(event.currentTarget).val();
  CORE_REVIEWERS = repo === 'adapt_authoring' ? AT_CORE_REVIEWERS : FW_CORE_REVIEWERS;
  getRepoData(repo, renderPRsForRepo);
  $('.inner').html('<div class="loading">Loading...</div>');
}
